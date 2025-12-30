import React, { useEffect, useState } from 'react';
import '../styles/Overview.css';
import { baseurl } from '../config';
import axios from 'axios';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { LineWithErrorBarsChart, LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';
import { ScatterController } from 'chart.js';
import { TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import { TABLEAU_20 } from '../utils/Plotting';

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
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
  const [pipelineLog, setPipelineLog] = useState('');
  const [logType, setLogType] = useState('service'); // 'service' or 'pipeline'
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState(null);
  const [biasPlotData, setBiasPlotData] = useState(null);
  const [darkPlotData, setDarkPlotData] = useState(null);
  const [flatPlotData, setFlatPlotData] = useState(null);
  const [selectedUnits, setSelectedUnits] = useState({});
  const [schedulerData, setSchedulerData] = useState([]);

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
    fetch(baseurl + '/plot?type=bias&param=clipmed')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setBiasPlotData(data);
      });
    fetch(baseurl + '/plot?type=dark&param=uniform')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDarkPlotData(data);
      });
    fetch(baseurl + '/plot?type=flat&param=sigmean')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setFlatPlotData(data);
      });
    
    // Fetch scheduler data
    axios.get(baseurl + '/scheduler')
      .then(response => {
        const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
        setSchedulerData(data);
      })
      .catch(err => {
        console.error('Error fetching scheduler data:', err);
      });
    
    // Set up interval for scheduler data
    const interval = setInterval(() => {
      axios.get(baseurl + '/scheduler')
        .then(response => {
          const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
          setSchedulerData(data);
        })
        .catch(err => {
          console.error('Error fetching scheduler data:', err);
        });
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // After all plot data is loaded, initialize selectedUnits if not set
    const allUnits = new Set();
    [biasPlotData, darkPlotData, flatPlotData].forEach(plotData => {
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
  }, [biasPlotData, darkPlotData, flatPlotData]);

  const handleShowLog = () => {
    // Fetch service log from API
    setLogLoading(true);
    setLogError(null);
    setLogType('service');
    
    fetch(baseurl + '/service-log')
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

  const handleShowPipelineLog = () => {
    // Fetch pipeline log from API
    setLogLoading(true);
    setLogError(null);
    setLogType('pipeline');
    
    fetch(baseurl + '/pipeline-log')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setLogError(data.error);
        } else {
          setPipelineLog(data.content || 'No log found');
        }
        setLogLoading(false);
        setLogPopup(true);
      })
      .catch(err => {
        setLogError('Failed to load pipeline log');
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
      const entries = (unitData[unit] || []).filter(entry => plotType === 'dark' ? Number(entry.exptime) === 100 : true);
      
      // Sort entries by date
      entries.sort((a, b) => {
        const dateA = a.run_date ? new Date(a.run_date) : new Date(0);
        const dateB = b.run_date ? new Date(b.run_date) : new Date(0);
        return dateA - dateB;
      });

      // Deduplicate by date (and by filter for flat)
      const seenKeys = new Set();
      const uniqueEntries = entries.filter(entry => {
        if (!entry.run_date) return false;
        const date = new Date(entry.run_date).toISOString().slice(0, 10);
        const filterKey = plotType === 'flat' ? (entry.filter || '') : '';
        const key = `${date}|${filterKey}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      const data = uniqueEntries.map(entry => {
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
        
        // Extract date from run_date field and convert to timestamp for time scale
        let date;
        let timestamp;
        if (entry.run_date) {
          const dateObj = new Date(entry.run_date);
          if (!isNaN(dateObj.getTime())) {
            date = dateObj.toISOString().slice(0, 10);
            timestamp = dateObj.getTime();
          } else {
            date = new Date().toISOString().slice(0, 10);
            timestamp = new Date().getTime();
          }
        } else {
          date = new Date().toISOString().slice(0, 10);
          timestamp = new Date().getTime();
        }

        return {
          x: timestamp, // Use timestamp for time scale
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

  // Year change annotations function copied exactly from _overview.js
  function getYearChangeAnnotations(plotData, plotType = null) {
    if (!plotData || !Array.isArray(plotData)) return {};
    
    // Collect all dates from all entries
    const allDates = [];
    plotData.forEach(entry => {
      if (entry.run_date) {
        const date = new Date(entry.run_date).toISOString().slice(0, 10);
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
      // Dark: uniform cutoff at 2.15
      annotations.uniformCutoff = {
        type: 'line',
        yMin: 2.15,
        yMax: 2.15,
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

  // Tooltip callbacks for all plots copied exactly from _overview.js
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

  // Calculate summary statistics for scheduler data
  const schedulerSummary = React.useMemo(() => {
    const total = schedulerData.length;
    const byRun = schedulerData.reduce((acc, item) => {
      const run = item.input_type || 'Unknown';
      acc[run] = (acc[run] || 0) + 1;
      return acc;
    }, {});
    const byGroup = schedulerData.reduce((acc, item) => {
      const group = item.type || 'Unknown';
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {});
    const byStatus = schedulerData.reduce((acc, item) => {
      const status = item.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    return { total, byRun, byGroup, byStatus };
  }, [schedulerData]);

  // Utility for status color
  function getStatusColor(status) {
    switch (status?.toLowerCase()) {
      case 'processing':
        return '#FFA500'; // orange
      case 'pending':
        return '#6c757d'; // gray
      case 'completed':
        return '#28A745'; // green
      case 'failed':
        return '#FF0000'; // red
      default:
        return '#6c757d';
    }
  }

  return (
    <div className="overview-container">
      <div className="status-card">
        <div className="status-card-header">
          <h2 className="overview-title">Pipeline Service</h2>
          <div className="status-card-actions">
            <button className="icon-btn" onClick={handleShowLog}>Show Service Log</button>
            <button className="icon-btn" onClick={handleShowPipelineLog}>Latest Processing Log</button>
          </div>
        </div>
        <div className="status">
          <strong>Status:</strong> <span className={serviceStatus === 'Active' ? 'status-active' : 'status-inactive'}>{serviceStatus}</span>
        </div>
        <div className="last-updated">
          <strong>Last Updated:</strong> {lastUpdated}
        </div>
        
        {/* Queue Summary Box */}
        {schedulerData.length > 0 && (
          <div className="scheduler-summary-box">
            <div className="scheduler-summary-item">
              <div className="scheduler-summary-label">Total Items</div>
              <div className="scheduler-summary-value">{schedulerSummary.total}</div>
            </div>
            <div className="scheduler-summary-item">
              <div className="scheduler-summary-label">By Run</div>
              <div className="scheduler-summary-list">
                {Object.entries(schedulerSummary.byRun).map(([run, count]) => (
                  <div key={run} className="scheduler-summary-entry">
                    <span className="scheduler-summary-entry-label">
                      {run.charAt(0).toUpperCase() + run.slice(1).toLowerCase()}:
                    </span>
                    <span className="scheduler-summary-entry-value">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="scheduler-summary-item">
              <div className="scheduler-summary-label">By Group</div>
              <div className="scheduler-summary-list">
                {Object.entries(schedulerSummary.byGroup).map(([group, count]) => (
                  <div key={group} className="scheduler-summary-entry">
                    <span className="scheduler-summary-entry-label">
                      {group.charAt(0).toUpperCase() + group.slice(1).toLowerCase()}:
                    </span>
                    <span className="scheduler-summary-entry-value">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="scheduler-summary-item">
              <div className="scheduler-summary-label">By Status</div>
              <div className="scheduler-summary-list">
                {Object.entries(schedulerSummary.byStatus).map(([status, count]) => (
                  <div key={status} className="scheduler-summary-entry">
                    <div
                      className="scheduler-status-badge"
                      data-status={status.toLowerCase()}
                    >
                      {status}
                    </div>
                    <span className="scheduler-summary-entry-value">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
        <div className="plot-placeholder">
          <div className="plot-container">
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
                      // Convert timestamp to date string if needed
                      if (typeof date === 'number') {
                        date = new Date(date).toISOString().slice(0, 10);
                      }
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { 
                      position: 'top',
                      labels: {
                        sort: (a, b) => a.text.localeCompare(b.text)
                      }
                    },
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
                    y: { 
                      title: { display: true, text: 'CLIPMED (ADU)' },
                      ticks: {
                        callback: function(value) {
                          if (value % 1 === 0) {
                            return value;
                          }
                          return parseFloat(value.toFixed(10)).toString();
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

        <h3 className="overview-subtitle">Dark</h3>
        <div className="plot-placeholder">
          <div className="plot-container">
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
                      // Convert timestamp to date string if needed
                      if (typeof date === 'number') {
                        date = new Date(date).toISOString().slice(0, 10);
                      }
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { 
                      position: 'top',
                      labels: {
                        sort: (a, b) => a.text.localeCompare(b.text)
                      }
                    },
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
                          if (value % 1 === 0) {
                            return value;
                          }
                          return parseFloat(value.toFixed(10)).toString();
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
        <div className="plot-placeholder">
          <div className="plot-container">
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
                      // Convert timestamp to date string if needed
                      if (typeof date === 'number') {
                        date = new Date(date).toISOString().slice(0, 10);
                      }
                      if (date !== null) {
                        onPlotClick(date);
                      }
                    }
                  },
                  onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                  },
                  plugins: {
                    legend: { 
                      position: 'top',
                      labels: {
                        sort: (a, b) => a.text.localeCompare(b.text)
                      }
                    },
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
                    y: { 
                      title: { display: true, text: 'SIGMEAN' },
                      ticks: {
                        callback: function(value) {
                          if (value % 1 === 0) {
                            return value;
                          }
                          return parseFloat(value.toFixed(10)).toString();
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

      </div>
      {logPopup && (
        <div className="popup-overlay">
          <div className="popup log-popup">
            <div className="popup-header">
              <button className="close-popup" onClick={() => setLogPopup(false)}>
                ✕
              </button>
            </div>
            <div className="popup-content">
              <h3>{logType === 'service' ? 'Service Log' : 'Latest Processing'}</h3>
              {logLoading ? <div>Loading...</div> : logError ? <div className="log-error">{logError}</div> : (
                <pre className="log-content log-content-container">
                  {logType === 'service' ? serviceLog : pipelineLog}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Overview;
