import React, { useEffect, useState } from 'react';
import '../styles/Overview.css';
import { baseurl } from '../config';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { LineWithErrorBarsChart, LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';
import { ScatterController } from 'chart.js';
import { TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

const TABLEAU_20 = [
    "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c",
    "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5",
    "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f",
    "#c7c7c7", "#bcbd22", "#dbdb8d", "#17becf", "#9edae5"
];

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale, // <-- Add this!
  Tooltip,
  Legend,
  LineWithErrorBarsChart,
  LineWithErrorBarsController,
  PointWithErrorBar,
  ScatterController,
  annotationPlugin
);

function Overview({ onPlotClick }) {
  const [serviceStatus, setServiceStatus] = useState('Loading...');
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
  const [logPopup, setLogPopup] = useState(false);
  const [serviceLog, setServiceLog] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState(null);
  const [biasPlotData, setBiasPlotData] = useState(null);
  const [darkPlotData, setDarkPlotData] = useState(null);
  const [flatPlotData, setFlatPlotData] = useState(null);
  const [bpmaskPlotData, setBpmaskPlotData] = useState(null);
  const [selectedUnits, setSelectedUnits] = useState({});

  useEffect(() => {
    const fetchStatus = () => {
      fetch(baseurl+'/service-status')
        .then(res => res.text())
        .then(status => {
          setServiceStatus(status.charAt(0).toUpperCase() + status.slice(1));
          setLastUpdated(new Date().toLocaleString());
        })
        .catch(() => setServiceStatus('Unknown'));
    };

    fetchStatus(); // initial fetch
    const interval = setInterval(fetchStatus, 10000); // every 10 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch(baseurl + '/plot?type=bias')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setBiasPlotData(data);
      });
    fetch(baseurl + '/plot?type=dark')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDarkPlotData(data);
      });
    fetch(baseurl + '/plot?type=flat')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setFlatPlotData(data);
      });
    fetch(baseurl + '/plot?type=bpmask')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setBpmaskPlotData(data);
      });
  }, []);

  useEffect(() => {
    // After all plot data is loaded, initialize selectedUnits if not set
    const allUnits = new Set();
    [biasPlotData, darkPlotData, flatPlotData, bpmaskPlotData].forEach(plotData => {
      if (plotData && Array.isArray(plotData)) {
        plotData.forEach(entry => {
          const unit = entry.unit || '';
          if (unit) {
            allUnits.add(unit);
          }
        });
      }
    });
    if (allUnits.size > 0 && Object.keys(selectedUnits).length === 0) {
      const initial = {};
      allUnits.forEach(u => { initial[u] = true; });
      setSelectedUnits(initial);
    }
  }, [biasPlotData, darkPlotData, flatPlotData, bpmaskPlotData]);

  const handleShowLog = () => {
    // Show service log file path and fetch content
    const logPath = '/var/log/pipeline-monitor.log';
    setLogLoading(true);
    setLogError(null);
    
    fetch(baseurl + `/text?file_path=${encodeURIComponent(logPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setLogError(data.error);
        } else {
          setServiceLog(data.content || 'No log found');
        }
        setLogLoading(false);
        setLogPopup(true);
      })
      .catch(err => {
        setLogError('Failed to load log');
        setLogLoading(false);
        setLogPopup(true);
      });
  };

  function getPlotChartData(plotData, plotType) {
    if (!plotData || !Array.isArray(plotData)) return null;
    
    // Group data by unit
    const unitData = {};
    plotData.forEach(entry => {
      const unit = entry.unit || '';
      if (unit) {
        if (!unitData[unit]) {
          unitData[unit] = [];
        }
        unitData[unit].push(entry);
      }
    });

    // Get all units and filter by selected ones
    const allUnits = Object.keys(unitData).sort();
    const selectedUnitsList = allUnits.filter(unit => selectedUnits[unit]);

    const datasets = selectedUnitsList.map((unit, idx) => {
      const color = TABLEAU_20[idx % TABLEAU_20.length];
      const entries = unitData[unit];
      
      // Sort entries by date
      entries.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateA - dateB;
      });

      const data = entries.map(entry => {
        let y, std, filter;
        
        if (plotType === 'dark') {
          y = entry.uniform || 0;
          std = 0; // uniform has no error bars
        } else if (plotType === 'flat') {
          y = entry.sigmean || 0;
          std = 0; // sigmean has no error bars
        } else { // bias
          y = entry.clipmed || 0;
          std = entry.clipstd || 0;
        }
        
        filter = entry.filter || '';
        
        // Extract date from run_date field
        let date;
        if (entry.run_date) {
          date = new Date(entry.run_date).toISOString().slice(0, 10);
        }
        if (!date && entry.created_at) {
          date = new Date(entry.created_at).toISOString().slice(0, 10);
        }
        if (!date) {
          date = new Date().toISOString().slice(0, 10);
        }

        return {
          x: date,
          y,
          yMin: y - std,
          yMax: y + std,
          std: std,
          filter: filter,
          sanity: entry.sanity,
        };
      });

      return {
        label: unit,
        data,
        borderColor: color,
        backgroundColor: color,
        errorBarColor: color,
        errorBarWhiskerColor: color,
        errorBarWhiskerSize: 3,
        type: plotType === 'dark' || plotType === 'flat' ? 'scatter' : 'lineWithErrorBars',
        showLine: false,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointStyle: data.map(point => point.sanity === false ? 'crossRot' : 'circle'),
      };
    });
    return { datasets };
  }

  function getBpmaskChartData(plotData) {
    if (!plotData || !Array.isArray(plotData)) return null;
    
    // Group data by unit
    const unitData = {};
    plotData.forEach(entry => {
      const unit = entry.unit || '';
      if (unit) {
        if (!unitData[unit]) {
          unitData[unit] = [];
        }
        unitData[unit].push(entry);
      }
    });

    // Get all units and filter by selected ones
    const allUnits = Object.keys(unitData).sort();
    const selectedUnitsList = allUnits.filter(unit => selectedUnits[unit]);

    const datasets = selectedUnitsList.map((unit, idx) => {
      const color = TABLEAU_20[idx % TABLEAU_20.length];
      const entries = unitData[unit];
      
      // Sort entries by date
      entries.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateA - dateB;
      });

      const data = entries.map(entry => {
        // Calculate percent hot pixels
        const nhotpix = entry.nhotpix || 0;
        const ntotpix = entry.ntotpix || 1;
        const percent_hot = (nhotpix / ntotpix * 100) || 0;
        
        // Extract date from run_date field
        let date;
        if (entry.run_date) {
          date = new Date(entry.run_date).toISOString().slice(0, 10);
        }
        if (!date && entry.created_at) {
          date = new Date(entry.created_at).toISOString().slice(0, 10);
        }
        if (!date) {
          date = new Date().toISOString().slice(0, 10);
        }

        return {
          x: date,
          y: percent_hot,
        };
      });

      return {
        label: unit,
        data,
        borderColor: color,
        backgroundColor: color,
        type: 'scatter',
        showLine: false,
          pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: color,
      };
    });
    return { datasets };
  }

  function getYearChangeAnnotations(plotData, plotType = null) {
    if (!plotData || !Array.isArray(plotData)) return {};
    
    // Collect all dates from all entries
    const allDates = [];
    plotData.forEach(entry => {
      let date;
      if (entry.run_date) {
        date = new Date(entry.run_date).toISOString().slice(0, 10);
      }
      if (!date && entry.created_at) {
        date = new Date(entry.created_at).toISOString().slice(0, 10);
      }
      if (date) {
        allDates.push(date);
      }
    });
    
    // Get unique years, sorted
    const years = Array.from(new Set(allDates.map(d => d.slice(0, 4)))).sort();
    // For each year after the first, add a vertical line at Jan 1
    const annotations = {};
    for (let i = 1; i < years.length; i++) {
      const year = years[i];
      annotations[`yearline${year}`] = {
        type: 'line',
        xMin: `${year}-01-01`,
        xMax: `${year}-01-01`,
        borderColor: 'rgba(0, 0, 0, 0.5)',
        borderWidth: 2,
        borderDash: [6, 6],
        label: {
          display: true,
          content: year,
          position: 'start',
          color: 'white',
          font: { weight: 'bold' }
        }
      };
    }
    
    // Add cutoff lines based on plot type
    if (plotType === 'dark') {
      // Dark: uniform cutoff at -2.15
      annotations.uniformCutoff = {
        type: 'line',
        yMin: -2.15,
        yMax: -2.15,
        borderColor: 'red',
        borderWidth: 2,
        borderDash: [5, 5],
      };
    } else if (plotType === 'bias') {
      // Bias: two cutoff lines at 512 and 514
      annotations.biasCutoff512 = {
        type: 'line',
        yMin: 512,
        yMax: 512,
        borderColor: 'red',
        borderWidth: 2,
        borderDash: [5, 5],
      };
      annotations.biasCutoff514 = {
        type: 'line',
        yMin: 514,
        yMax: 514,
        borderColor: 'red',
        borderWidth: 2,
        borderDash: [5, 5],
      };
    } else if (plotType === 'flat') {
      // Flat: sigmean cutoff at 0.05
      annotations.sigmeanCutoff = {
        type: 'line',
        yMin: 0.05,
        yMax: 0.05,
        borderColor: 'red',
        borderWidth: 2,
        borderDash: [5, 5],
      };
    }
    
    return { annotations };
  }

  // Tooltip callbacks for all plots
  const tooltipTitleCallback = function(context) {
    let date = context[0].parsed.x;
    if (typeof date === 'number') {
      date = new Date(date);
    }
    if (date instanceof Date && !isNaN(date)) {
      return date.toISOString().slice(0, 10);
    }
    if (typeof date === 'string') {
      return date.slice(0, 10);
    }
    return date;
  };

  return (
    <div className="overview-container">
      <div className="status-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="overview-title">Pipeline Service</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={handleShowLog}>Show Service Log</button>
        </div>
        <div className="status">
          <strong>Status:</strong> <span style={{ color: serviceStatus === 'Active' ? '#28a745' : '#d32f2f' }}>{serviceStatus}</span>
        </div>
        <div className="last-updated">
          <strong>Last Updated:</strong> {lastUpdated}
        </div>
      </div>
      <div className="plots-section">
        <h2 className="overview-title">Status</h2>

        {/* Unit selection checkboxes */}
        <div className="unit-checkboxes">
          {Object.keys(selectedUnits).sort().map(unit => (
            <label key={unit}>
              <input
                type="checkbox"
                checked={selectedUnits[unit]}
                onChange={() => setSelectedUnits(s => ({ ...s, [unit]: !s[unit] }))}
              />
              {unit}
            </label>
          ))}
        </div>

        <h3 className="overview-subtitle">Bias</h3>
        <div className="plot-placeholder" style={{ overflowX: 'auto', width: '100%' }}>
          <div style={{ minWidth: 2000, maxWidth: 'none' }}>
            {biasPlotData ? (
              <Line
                data={getPlotChartData(biasPlotData, 'bias')}
                options={{
                  responsive: false,
                  maintainAspectRatio: false,
                  onClick: (event, elements) => {
                    if (elements.length > 0) {
                      const element = elements[0];
                      let date = element.element.$context.raw.x;
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Bias CLIPMED vs DATE-OBS' },
                    annotation: getYearChangeAnnotations(biasPlotData, 'bias'),
                    tooltip: {
                      callbacks: {
                        title: tooltipTitleCallback,
                        label: function(context) {
                          const y = context.parsed.y;
                          const std = context.raw.std;
                          const label = context.dataset.label || '';
                          if (std !== undefined) {
                            return `${label}: ${y.toFixed(1)} ± ${std.toFixed(1)}`;
                          }
                          return `${label}: ${y.toFixed(1)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      type: 'time',
                      time: {
                        unit: 'day',
                        displayFormats: { day: 'MM-dd' }
                      },
                      title: { display: true, text: 'Observation Date (UTC)' },
                      ticks: { maxRotation: 90, minRotation: 45, autoSkip: true, maxTicksLimit: 50 },
                    },
                    y: { title: { display: true, text: 'CLIPMED (ADU)' } },
                  },
                }}
                width={2000}
                height={400}
              />
            ) : (
              "Loading plot..."
            )}
          </div>
        </div>

        <h3 className="overview-subtitle">Dark</h3>
        <div className="plot-placeholder" style={{ overflowX: 'auto', width: '100%' }}>
          <div style={{ minWidth: 2000, maxWidth: 'none' }}>
            {darkPlotData ? (
              <Line
                data={getPlotChartData(darkPlotData, 'dark')}
                options={{
                  responsive: false,
                  maintainAspectRatio: false,
                  onClick: (event, elements) => {
                    if (elements.length > 0) {
                      const element = elements[0];
                      let date = element.element.$context.raw.x;
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Dark UNIFORM vs DATE-OBS' },
                    annotation: getYearChangeAnnotations(darkPlotData, 'dark'),
                    tooltip: {
                      callbacks: {
                        title: tooltipTitleCallback,
                        label: function(context) {
                          const y = context.parsed.y;
                          const label = context.dataset.label || '';
                          return `${label}: ${y.toFixed(2)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      type: 'time',
                      time: {
                        unit: 'day',
                        displayFormats: { day: 'MM-dd' }
                      },
                      title: { display: true, text: 'Observation Date (UTC)' },
                      ticks: { maxRotation: 90, minRotation: 45, autoSkip: true, maxTicksLimit: 50 },
                    },
                    y: { 
                      title: { display: true, text: 'UNIFORM' },
                      grid: {
                        color: function(context) {
                          if (context.tick.value === -2.15) {
                            return 'red';
                          }
                          return 'rgba(0, 0, 0, 0.1)';
                        }
                      },
                      ticks: {
                        callback: function(value) {
                          if (value === -2.15) {
                            return 'Cutoff: -2.15';
                          }
                          return value;
                        }
                      }
                    },
                  },
                }}
                width={2000}
                height={400}
              />
            ) : (
              "Loading plot..."
            )}
          </div>
        </div>

        <h3 className="overview-subtitle">Flat</h3>
        <div className="plot-placeholder" style={{ overflowX: 'auto', width: '100%' }}>
          <div style={{ minWidth: 2000, maxWidth: 'none' }}>
            {flatPlotData ? (
              <Line
                data={getPlotChartData(flatPlotData, 'flat')}
                options={{
                  responsive: false,
                  maintainAspectRatio: false,
                  onClick: (event, elements) => {
                    if (elements.length > 0) {
                      const element = elements[0];
                      let date = element.element.$context.raw.x;
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Flat SIGMEAN vs DATE-OBS' },
                    annotation: getYearChangeAnnotations(flatPlotData, 'flat'),
                    tooltip: {
                      callbacks: {
                        title: tooltipTitleCallback,
                        label: function(context) {
                          const y = context.parsed.y;
                          const filter = context.raw.filter;
                          const label = context.dataset.label || '';
                          return `${label} (${filter}): ${y.toFixed(2)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      type: 'time',
                      time: {
                        unit: 'day',
                        displayFormats: { day: 'MM-dd' }
                      },
                      title: { display: true, text: 'Observation Date (UTC)' },
                      ticks: { maxRotation: 90, minRotation: 45, autoSkip: true, maxTicksLimit: 50 },
                    },
                    y: { title: { display: true, text: 'SIGMEAN' } },
                  },
                }}
                width={2000}
                height={400}
              />
            ) : (
              "Loading plot..."
            )}
          </div>
        </div>

        {/*<h3 className="overview-subtitle">Hot Pixel %</h3>
         <div className="plot-placeholder" style={{ overflowX: 'auto', width: '100%' }}>
          <div style={{ minWidth: 2000, maxWidth: 'none' }}>
            {bpmaskPlotData ? (
              <Line
                data={getBpmaskChartData(bpmaskPlotData)}
                options={{
                  responsive: false,
                  maintainAspectRatio: false,
                  onClick: (event, elements) => {
                    if (elements.length > 0) {
                      const element = elements[0];
                      let date = element.element.$context.raw.x;
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Percent of Hot Pixel vs DATE-OBS' },
                    annotation: getYearChangeAnnotations(bpmaskPlotData, 'bpmask'),
                    tooltip: {
                      callbacks: {
                        title: tooltipTitleCallback,
                        label: function(context) {
                          const y = context.parsed.y;
                          const label = context.dataset.label || '';
                          return `${label}: ${y.toFixed(2)} %`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      type: 'time',
                      time: {
                        unit: 'day',
                        displayFormats: { day: 'MM-dd' }
                      },
                      title: { display: true, text: 'Observation Date (UTC)' },
                      ticks: { maxRotation: 90, minRotation: 45, autoSkip: true, maxTicksLimit: 50 },
                    },
                    y: { title: { display: true, text: 'Percent of hot pixels [%]' } },
                  },
                }}
                width={2000}
                height={400}
              />
            ) : (
              "Loading plot..."
            )}
          </div>
        </div> */}
      </div>
      {logPopup && (
        <div className="popup-overlay">
          <div className="popup" style={{ maxWidth: 700 }}>
            <div className="popup-header">
              <button className="close-popup" onClick={() => setLogPopup(false)}>
                ✕
              </button>
            </div>
            <div className="popup-content">
              <h3>Service Log</h3>
              {logLoading ? <div>Loading...</div> : logError ? <div style={{ color: 'red' }}>{logError}</div> : (
                <pre className="log-content" style={{ maxHeight: 400, overflow: 'auto', background: '#f9f9f9', borderRadius: 8, padding: 12 }}>{serviceLog}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Overview;
