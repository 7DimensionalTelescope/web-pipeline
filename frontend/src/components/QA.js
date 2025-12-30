import React, { useEffect, useState, useCallback, useMemo } from 'react';
import '../styles/QA.css';
import '../styles/PipelineTable.css';
import { baseurl, parametersByDataTypeV1, parametersByDataTypeV2, dataTypeOptions } from '../config';
import { ChartRenderer } from '../utils/Plotting';
import { toChileLocalTime, toChileLocalDate, convertInstLogDate, extractUnitNumber, getPartColor, filterDataBySelections, getDateField } from '../utils/QAUtils';
import { transformChartData, transformHistogramData, hasBoxPlotData, transformBoxPlotData } from '../utils/QAUtils';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import Slider from '@mui/material/Slider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import jsPDF from 'jspdf';

function QA() {
  // Fixed date range for slider: min is 2023-10-23, max is today
  const getTodayDate = () => new Date().toISOString().slice(0, 10);
  const getDate7DaysAgo = () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  };
  
  const [plotData, setPlotData] = useState({}); // Store per-parameter data
  const [availableUnits, setAvailableUnits] = useState([]);
  const [availableFilters, setAvailableFilters] = useState([]);
  const [availableObjects, setAvailableObjects] = useState([]);
  const [instLogData, setInstLogData] = useState({ events: [] });
  const [availableInstLogParts, setAvailableInstLogParts] = useState([]);
  const [qaConfig, setQaConfig] = useState({ masterframe: null, science: null });
  const [plots, setPlots] = useState([
    {
      id: 1,
      dataType: 'science', // 'bias', 'dark', 'flat', 'science'
      parameter: 'seeing', // Default to seeing parameter
      units: [],
      filters: [],
      objects: [],
      chartType: 'line', // 'line' or 'histogram'
      enabled: true,
      dateMin: getDate7DaysAgo(),
      dateMax: getTodayDate(),
      instLogParts: [], // Selected instrument log parts
      expanded: false, // Whether detailed selection is expanded
      version: 'v2' // Pipeline version: 'v1' or 'v2'
    }
  ]);
  const [dateRange] = useState({ 
    min: '2023-10-23', 
    max: getTodayDate() 
  });
  const [loadingStates, setLoadingStates] = useState({}); // Track loading per plot parameter
  const [sliderValues, setSliderValues] = useState({}); // Temporary slider values for visual feedback during dragging

  // Function to get parameters for a specific data type based on version
  const getParametersForDataType = (dataType, version = 'v1') => {
    const params = version === 'v1' ? parametersByDataTypeV1 : parametersByDataTypeV2;
    return params[dataType] || [];
  };

  // Get cutoff annotations from QA config
  const getCutoffAnnotations = (plot) => {
    const { dataType, parameter } = plot;
    const annotations = {};

    // Map dataType to config type
    const configType = (dataType === 'science') ? 'science' : 'masterframe';
    const configResponse = qaConfig[configType];
    
    // The stored config might be the full API response with { success, type, data }
    // or just the data object. Handle both cases.
    const config = configResponse?.data || configResponse;
    
    if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
      return annotations;
    }

    // Map dataType to uppercase for config lookup
    const dataTypeUpper = dataType.toUpperCase();
    const paramUpper = parameter.toUpperCase();

    // Get parameter config from the appropriate data type section
    const dataTypeConfig = config[dataTypeUpper];
    if (!dataTypeConfig) {
      return annotations;
    }

    // Get the parameter config
    const paramConfig = dataTypeConfig[paramUpper];
    if (!paramConfig || paramConfig.value === undefined || paramConfig.value === null) {
      return annotations;
    }

    // Extract cutoff value(s)
    const cutoffValue = paramConfig.value;
    
    // Handle both single value and array of values
    const cutoffValues = Array.isArray(cutoffValue) ? cutoffValue : [cutoffValue];
    
    // Create annotation for each cutoff value
    cutoffValues.forEach((value, index) => {
      // Skip if value is not a number (e.g., boolean false)
      if (typeof value !== 'number') {
        return;
      }

      const annotationKey = `cutoff_${paramUpper}_${index}`;
      annotations[annotationKey] = {
        type: 'line',
        yMin: value,
        yMax: value,
        borderColor: 'red',
        borderWidth: 2,
        borderDash: [5, 5],
      };
    });

    return annotations;
  };

  // Get instrument log annotations for the chart
  const getInstLogAnnotations = (plot) => {
    const { instLogParts, units, dataType } = plot;
    
    if (!instLogParts || instLogParts.length === 0) {
      return {};
    }
    
    if (!instLogData.events || instLogData.events.length === 0) {
      return {};
    }
    
    // If no units are selected, don't show any annotations
    if (!units || units.length === 0) {
      return {};
    }

    const annotations = {};
    
    const filteredEvents = instLogData.events.filter(event => {
      // Filter by selected units - extract numeric part from both formats
      // This is required - if no units match, don't show the annotation
      const eventUnitNum = extractUnitNumber(event.unit);
      const unitMatches = units.some(plotUnit => {
        const plotUnitNum = extractUnitNumber(plotUnit);
        return eventUnitNum && plotUnitNum && eventUnitNum === plotUnitNum;
      });
      if (!unitMatches) {
        return false;
      }
      
      // Filter by selected parts
      const partMatches = instLogParts.includes(event.parts);
      if (!partMatches) {
        return false;
      }
      return true;
    });

    filteredEvents.forEach((event, index) => {
      const dateStr = convertInstLogDate(event.date);
      if (!dateStr) {
        return;
      }

      const annotationKey = `instLog_${event.parts}_${index}`;
      const partColor = getPartColor(event.parts);
      
      // Format label content with unit and description - use array for multi-line
      const labelContent = [
        `Unit: ${event.unit || 'N/A'}`,
        `${event.comment || 'N/A'}`
      ];
      
      annotations[annotationKey] = {
        type: 'line',
        xMin: dateStr,
        xMax: dateStr,
        borderColor: partColor,
        borderWidth: 1,
        label: {
          display: false,
          content: labelContent,
          position: 'start',
          color: '#fff',
          font: { size: 10, family: 'Arial, sans-serif' },
          backgroundColor: partColor,
          padding: { x: 6, y: 4 },
          cornerRadius: 4,
          borderWidth: 0
        },
        enter: function(context) {
          if (context.element && context.element.label) {
            context.element.label.options.display = true;
            context.chart.draw();
          }
        },
        leave: function(context) {
          if (context.element && context.element.label) {
            context.element.label.options.display = false;
            context.chart.draw();
          }
        }
      };
    });

    return annotations;
  };



  // Extract metadata from plot data when it's loaded
  const extractMetadata = useCallback((data, dataType) => {
    if (!data || data.error || !Array.isArray(data)) return;

    const units = new Set(availableUnits);
    const filters = new Set(availableFilters);
    const objects = new Set(availableObjects);

    data.forEach(entry => {
      if (entry.unit) units.add(entry.unit);
      if (entry.filter) filters.add(entry.filter);
      if (entry.object) objects.add(entry.object);
    });

    // Update available options
    if (units.size > availableUnits.length) {
      setAvailableUnits(Array.from(units).sort());
    }
    if (filters.size > availableFilters.length) {
      setAvailableFilters(Array.from(filters).sort());
    }
    if (objects.size > availableObjects.length) {
      setAvailableObjects(Array.from(objects).sort());
    }
  }, [availableUnits, availableFilters, availableObjects]);

  // Fetch config and inst-log on mount (lightweight)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [instLogRes, masterframeConfigRes, scienceConfigRes] = await Promise.all([
          fetch(baseurl + '/inst-log'),
          fetch(baseurl + '/qa-config?type=masterframe'),
          fetch(baseurl + '/qa-config?type=science')
        ]);

        const [instLogDataResponse, masterframeConfig, scienceConfig] = await Promise.all([
          instLogRes.json(),
          masterframeConfigRes.json(),
          scienceConfigRes.json()
        ]);

        // Process QA config data
        const masterframeConfigData = masterframeConfig.error ? null : masterframeConfig;
        const scienceConfigData = scienceConfig.error ? null : scienceConfig;
        setQaConfig({ masterframe: masterframeConfigData, science: scienceConfigData });

        // Process instrument log data
        const instLog = instLogDataResponse.error ? { events: [] } : instLogDataResponse;
        setInstLogData(instLog);
        
        // Extract unique parts from inst-log
        const parts = new Set();
        if (instLog.events && Array.isArray(instLog.events)) {
          instLog.events.forEach(event => {
            if (event.parts) {
              parts.add(event.parts);
            }
          });
        }
        const sortedParts = Array.from(parts).sort();
        setAvailableInstLogParts(sortedParts);
      } catch (error) {
        console.error('Error fetching config:', error);
      }
    };

    fetchConfig();
  }, []);

  // Fetch plot data for a specific parameter on demand (fetch all data, filter client-side)
  const fetchPlotParameter = async (dataType, parameter, dateMin = null, dateMax = null, version = 'v1') => {
    // Include date range and version in data key for caching different date ranges and versions
    const dataKey = `${dataType}_${parameter}_${dateMin || ''}_${dateMax || ''}_${version}`;
    
    // Check if already loaded
    if (plotData[dataKey]) {
      return;
    }

    // Set loading state
    setLoadingStates(prev => ({ ...prev, [dataKey]: true }));

    try {
      // Build URL with parameter, date filters and version for backend filtering
      let url = `${baseurl}/plot?type=${dataType}&param=${parameter}&version=${version}`;
      if (dateMin) {
        url += `&dateMin=${dateMin}`;
      }
      if (dateMax) {
        url += `&dateMax=${dateMax}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.error) {
        setPlotData(prev => ({
          ...prev,
          [dataKey]: data
        }));
        
        // Extract metadata from the loaded data
        extractMetadata(data, dataType);
      }
    } catch (error) {
      console.error(`Error fetching ${dataType}/${parameter}:`, error);
    } finally {
      setLoadingStates(prev => ({ ...prev, [dataKey]: false }));
    }
  };

  // Fetch data for all active plots when dataType, parameter, date range, or version changes
  useEffect(() => {
    plots.forEach(plot => {
      if (plot.enabled && plot.dataType && plot.parameter) {
        const version = plot.version || 'v1';
        const dataKey = `${plot.dataType}_${plot.parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${version}`;
        // Fetch if not already loaded
        if (!plotData[dataKey] && !loadingStates[dataKey]) {
          fetchPlotParameter(plot.dataType, plot.parameter, plot.dateMin, plot.dateMax, version);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots.map(p => `${p.dataType}_${p.parameter}_${p.dateMin || ''}_${p.dateMax || ''}_${p.version || 'v1'}`).join(',')]);

  const addPlot = () => {
    const newId = Math.max(...plots.map(p => p.id), 0) + 1;
    const scienceParams = getParametersForDataType('science', 'v2');
    setPlots([...plots, {
      id: newId,
      dataType: 'science',
      parameter: scienceParams.length > 0 ? scienceParams[0].value : 'seeing',
      units: [...availableUnits], // Select all units by default
      filters: [...availableFilters], // Select all filters by default
      objects: [], // Start with no objects selected by default
      chartType: 'line',
      enabled: true,
      dateMin: getDate7DaysAgo(),
      dateMax: getTodayDate(),
      instLogParts: [], // Start with no instrument log parts selected
      expanded: false, // Start collapsed
      version: 'v2' // Default to v2
    }]);
  };

  const removePlot = (plotId) => {
    if (plots.length > 1) {
      setPlots(plots.filter(p => p.id !== plotId));
    }
  };

  const updatePlot = useCallback((plotId, updates) => {
    setPlots(prevPlots => prevPlots.map(p => p.id === plotId ? { ...p, ...updates } : p));
  }, []);

  const toggleSelection = (plotId, type, value) => {
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    const currentArray = plot[type];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];

    updatePlot(plotId, { [type]: newArray });
  };

  const toggleAllSelection = (plotId, type, allValues) => {
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    const currentArray = plot[type];
    const isAllSelected = allValues.every(val => currentArray.includes(val));
    
    updatePlot(plotId, { 
      [type]: isAllSelected ? [] : [...allValues] 
    });
  };

  const getChartData = (plot) => {
    const { dataType, parameter } = plot;
    const version = plot.version || 'v1';
    // Data key includes date range and version since backend filters by date and version
    const dataKey = `${dataType}_${parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${version}`;
    const dataSource = plotData[dataKey] || [];
    
    if (loadingStates[dataKey] || !dataSource || dataSource.length === 0) {
      return { datasets: [] };
    }

    // Check if data has box plot properties (q1, q3, min, max)
    if (hasBoxPlotData(dataSource) && plot.chartType !== 'histogram') {
      return transformBoxPlotData(dataSource, plot, (dataType) => getParametersForDataType(dataType, version));
    }

    // No client-side date filtering needed - backend already filtered
    return transformChartData(dataSource, plot, (dataType) => getParametersForDataType(dataType, version));
  };

  const getHistogramData = (plot) => {
    const { dataType, parameter } = plot;
    const version = plot.version || 'v1';
    // Data key includes date range and version since backend filters by date and version
    const dataKey = `${dataType}_${parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${version}`;
    const dataSource = plotData[dataKey] || [];
    
    if (loadingStates[dataKey] || !dataSource || dataSource.length === 0) {
      return { datasets: [] };
    }

    // No client-side date filtering needed - backend already filtered
    return transformHistogramData(dataSource, plot, (dataType) => getParametersForDataType(dataType, version));
  };

  // Export plot data to CSV
  const exportToCSV = (plot) => {
    const { dataType, parameter, units, filters, objects, dateMin, dateMax } = plot;
    const version = plot.version || 'v1';
    
    // Get data for this specific parameter (includes date range and version since backend filters by date and version)
    const dataKey = `${dataType}_${parameter}_${dateMin || ''}_${dateMax || ''}_${version}`;
    const dataSource = plotData[dataKey] || [];

    // Use the same filtering logic as charts
    const filteredData = filterDataBySelections(dataSource, dataType, units, filters, objects);

    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    // Sort by date
    filteredData.sort((a, b) => {
      const dateFieldA = getDateField(a, dataType);
      const dateFieldB = getDateField(b, dataType);
      const dateA = dateFieldA ? new Date(dateFieldA) : new Date(0);
      const dateB = dateFieldB ? new Date(dateFieldB) : new Date(0);
      return dateA - dateB;
    });

    // Prepare CSV headers
    const paramInfo = getParametersForDataType(dataType, version).find(p => p.value === parameter);
    const paramLabel = paramInfo?.label || parameter.toUpperCase();
    
    // Check if data has box plot statistics
    const hasBoxPlotStats = filteredData.some(entry => 
      entry.q1 != null && entry.q3 != null && entry.min != null && entry.max != null
    );
    
    const headers = ['DATE-OBS', 'UNIT', paramLabel];
    if (hasBoxPlotStats) {
      headers.push('MIN', 'Q1', 'MEDIAN', 'Q3', 'MAX');
    }
    if (dataType === 'flat' || dataType === 'science') {
      headers.push('FILTER');
    }
    if (dataType === 'science') {
      headers.push('OBJECT');
    }

    // Build CSV rows
    const rows = filteredData.map(entry => {
      const row = [];
      
      // DATE-OBS - show only date (not datetime) for grouped data
      const dateField = getDateField(entry, dataType);
      let date = '';
      if (dateField) {
        const dateObj = new Date(dateField);
        if (!isNaN(dateObj.getTime())) {
          // Always use date only for CSV export
          date = toChileLocalDate(dateObj);
        }
      }
      row.push(date);
      
      // UNIT
      row.push(entry.unit || '');
      
      // Parameter value
      const value = entry[parameter];
      row.push(value !== null && value !== undefined ? value : '');
      
      // Box plot statistics (if available)
      if (hasBoxPlotStats) {
        row.push(
          entry.min != null ? entry.min : '',
          entry.q1 != null ? entry.q1 : '',
          entry.median != null ? entry.median : '',
          entry.q3 != null ? entry.q3 : '',
          entry.max != null ? entry.max : ''
        );
      }
      
      // FILTER (for flat and science)
      if (dataType === 'flat' || dataType === 'science') {
        row.push(entry.filter || '');
      }
      
      // OBJECT (for science)
      if (dataType === 'science') {
        row.push(entry.object || '');
      }
      
      return row;
    });

    // Escape CSV values and join
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV content
    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename
    const filename = `${dataType}_${paramLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export plot chart as PDF
  const exportToPDF = (plot) => {
    const { dataType, parameter } = plot;
    
    // Find the chart canvas element for this plot
    const chartKey = `${plot.id}-${plot.dataType}-${plot.parameter}-${plot.chartType}-${plot.instLogParts.join(',')}`;
    const chartContainer = document.querySelector(`[data-chart-key="${chartKey}"]`);
    
    if (!chartContainer) {
      alert('Chart not found. Please wait for the chart to load.');
      return;
    }

    // Find the canvas element - it could be directly in the container or nested
    const canvas = chartContainer.querySelector('canvas');
    if (!canvas) {
      alert('Chart canvas not found.');
      return;
    }

    // Get chart image as base64
    const imageData = canvas.toDataURL('image/png', 1.0);
    
    // Get parameter info for filename and title
    const version = plot.version || 'v1';
    const paramInfo = getParametersForDataType(dataType, version).find(p => p.value === parameter);
    const paramLabel = paramInfo?.label || parameter.toUpperCase();
    
    // Create PDF - use landscape for wide charts
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    
    // Calculate dimensions to fit the chart while maintaining aspect ratio
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxWidth = pdfWidth - (2 * margin);
    const maxHeight = pdfHeight - 40; // Leave space for title
    
    // Calculate image dimensions maintaining aspect ratio
    const canvasAspectRatio = canvas.height / canvas.width;
    let imgWidth = maxWidth;
    let imgHeight = imgWidth * canvasAspectRatio;
    
    // If height exceeds max, scale down
    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = imgHeight / canvasAspectRatio;
    }
    
    // Center the image horizontally
    const xPos = (pdfWidth - imgWidth) / 2;
    
    // Add title
    pdf.setFontSize(16);
    pdf.text(`${paramLabel} - ${dataType.toUpperCase()}`, pdfWidth / 2, 15, { align: 'center' });
    
    // Add the chart image
    pdf.addImage(imageData, 'PNG', xPos, 25, imgWidth, imgHeight);
    
    // Generate filename
    const filename = `${dataType}_${paramLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;
    
    // Save PDF
    pdf.save(filename);
  };

  // Memoize chart data for all plots to avoid recalculation on every render
  const memoizedChartData = useMemo(() => {
    const chartDataMap = {};
    plots.forEach(plot => {
      if (plot.enabled && plot.dataType && plot.parameter) {
        const version = plot.version || 'v1';
        const dataKey = `${plot.dataType}_${plot.parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${version}`;
        if (plotData[dataKey] && !loadingStates[dataKey]) {
          chartDataMap[plot.id] = plot.chartType === 'histogram' 
            ? getHistogramData(plot) 
            : getChartData(plot);
        }
      }
    });
    return chartDataMap;
  }, [
    plots,
    plotData,
    loadingStates
  ]);

  return (
    <div className="qa-container">
      <div className="qa-header">
        <h2 className="qa-title">QA</h2>
        <button className="add-plot-btn" onClick={addPlot}>
          <AddIcon fontSize="small" />
          Add Plot
        </button>
      </div>

      {plots.map((plot) => (
        <div key={plot.id} className="plot-section">
          <div className="plot-controls">
            <div className="plot-header">
              <h3>Plot {plot.id}</h3>
              <div className="plot-header-actions">
                <button 
                  className="export-csv-btn"
                  onClick={() => exportToCSV(plot)}
                >
                  <FileDownloadIcon fontSize="small" />
                  Export CSV
                </button>
                <button 
                  className="export-pdf-btn"
                  onClick={() => exportToPDF(plot)}
                >
                  <PictureAsPdfIcon fontSize="small" />
                  Export PDF
                </button>
                {plots.length > 1 && (
                  <button 
                    className="remove-plot-btn" 
                    onClick={() => removePlot(plot.id)}
                  >
                    <RemoveIcon fontSize="small" />
                  </button>
                )}
              </div>
            </div>

            
            <div className="compact-controls">
              <div className="control-row">
                <div className="control-group">
                  <label>Pipeline Version:</label>
                  <div className="radio-group-container">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name={`pipelineVersion_${plot.id}`}
                        value="v1"
                        checked={(plot.version || 'v1') === 'v1'}
                        onChange={(e) => {
                          const version = e.target.value;
                          const scienceParams = getParametersForDataType('science', version);
                          updatePlot(plot.id, { 
                            version: version,
                            dataType: 'science',
                            parameter: scienceParams.length > 0 ? scienceParams[0].value : 'seeing'
                          });
                          // Clear plot data cache for this plot when version changes
                          setPlotData(prev => {
                            const newData = { ...prev };
                            // Remove old data keys for this plot
                            Object.keys(newData).forEach(key => {
                              if (key.startsWith(`${plot.dataType}_${plot.parameter}_`) && !key.endsWith(`_${version}`)) {
                                delete newData[key];
                              }
                            });
                            return newData;
                          });
                        }}
                      />
                      <span>v1</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name={`pipelineVersion_${plot.id}`}
                        value="v2"
                        checked={(plot.version || 'v1') === 'v2'}
                        onChange={(e) => {
                          const version = e.target.value;
                          const availableParams = getParametersForDataType(plot.dataType, version);
                          updatePlot(plot.id, { 
                            version: version,
                            parameter: availableParams.length > 0 && availableParams.some(p => p.value === plot.parameter)
                              ? plot.parameter
                              : (availableParams.length > 0 ? availableParams[0].value : '')
                          });
                          // Clear plot data cache for this plot when version changes
                          setPlotData(prev => {
                            const newData = { ...prev };
                            // Remove old data keys for this plot
                            Object.keys(newData).forEach(key => {
                              if (key.startsWith(`${plot.dataType}_${plot.parameter}_`) && !key.endsWith(`_${version}`)) {
                                delete newData[key];
                              }
                            });
                            return newData;
                          });
                        }}
                      />
                      <span>v2</span>
                    </label>
                  </div>
                </div>
              
                <div className="control-group">
                  <label>Data Type:</label>
                  <select 
                    value={(plot.version || 'v1') === 'v1' ? 'science' : plot.dataType}
                    disabled={(plot.version || 'v1') === 'v1'}
                    onChange={(e) => {
                      const newDataType = e.target.value;
                      const version = plot.version || 'v1';
                      const availableParams = getParametersForDataType(newDataType, version);
                      // Add a small delay to prevent chart rendering issues
                      setTimeout(() => {
                        updatePlot(plot.id, { 
                          dataType: newDataType,
                          parameter: availableParams.length > 0 ? availableParams[0].value : ''
                        });
                      }, 10);
                    }}
                    className={(plot.version || 'v1') === 'v1' ? 'disabled-select' : ''}
                  >
                    {dataTypeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <label>Parameter:</label>
                  <select 
                    value={plot.parameter} 
                    onChange={(e) => updatePlot(plot.id, { parameter: e.target.value })}
                  >
                    {getParametersForDataType(plot.dataType, plot.version || 'v1').map(param => (
                      <option key={param.value} value={param.value}>
                        {param.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <label>Chart Type:</label>
                  <select 
                    value={plot.chartType} 
                    onChange={(e) => updatePlot(plot.id, { chartType: e.target.value })}
                  >
                    <option value="line">Line Chart</option>
                    <option value="histogram">Histogram</option>
                  </select>
                </div>

                

                <div className="control-group date-range-group">
                  <label>Date Range:</label>
                  <div className="date-range-controls">
                    {/* TESTING: Slider is interactive but does NOT affect chart/data */}
                    <input
                      type="date"
                      className="date-input date-input-small"
                      value={(() => {
                        const currentSliderValue = sliderValues[plot.id];
                        if (currentSliderValue) {
                          return new Date(currentSliderValue[0]).toISOString().slice(0, 10);
                        }
                        // Use plot dates if available, otherwise dateRange
                        return plot.dateMin || dateRange.min || '';
                      })()}
                      min={dateRange.min || '2023-10-23'}
                      max={dateRange.max || getTodayDate()}
                      onChange={(e) => {
                        // TESTING: Only update sliderValues state, NO chart updates, NO plot.dateMin/dateMax access
                        const newDateMin = e.target.value;
                        if (!newDateMin) return;
                        const newDateMinTime = new Date(newDateMin).getTime();
                        const currentSliderValue = sliderValues[plot.id];
                        if (currentSliderValue) {
                          setSliderValues(prev => ({
                            ...prev,
                            [plot.id]: [newDateMinTime, currentSliderValue[1]]
                          }));
                        } else {
                          // Initialize from plot dates or dateRange
                          const maxTime = plot.dateMax 
                            ? new Date(plot.dateMax).getTime()
                            : (dateRange.max ? new Date(dateRange.max).getTime() : Date.now());
                          setSliderValues(prev => ({
                            ...prev,
                            [plot.id]: [newDateMinTime, maxTime]
                          }));
                        }
                      }}
                      disabled={false}
                    />
                    <div className="slider-container">
                      <Slider
                        getAriaLabel={() => 'Date range'}
                        value={(() => {
                          const currentSliderValue = sliderValues[plot.id];
                          if (currentSliderValue) {
                            return currentSliderValue;
                          }
                          // Use plot dates if available, otherwise use fixed date range
                          if (plot.dateMin && plot.dateMax) {
                            return [
                              new Date(plot.dateMin).getTime(),
                              new Date(plot.dateMax).getTime()
                            ];
                          }
                          // Default to fixed date range: 2023-10-23 to today
                          return [
                            new Date(dateRange.min).getTime(),
                            new Date(dateRange.max).getTime()
                          ];
                        })()}
                        onChange={(e, newValue) => {
                          // TESTING: Only update sliderValues state, NO chart updates, NO plot.dateMin/dateMax access
                          setSliderValues(prev => ({ ...prev, [plot.id]: newValue }));
                        }}
                        valueLabelDisplay="auto"
                        min={new Date(dateRange.min || '2023-10-23').getTime()}
                        max={new Date(dateRange.max || getTodayDate()).getTime()}
                        getAriaValueText={(value) => new Date(value).toISOString().slice(0, 10)}
                        valueLabelFormat={(value) => new Date(value).toISOString().slice(0, 10)}
                        disabled={false}
                      />
                    </div>
                    <input
                      type="date"
                      className="date-input date-input-small"
                      value={(() => {
                        const currentSliderValue = sliderValues[plot.id];
                        if (currentSliderValue) {
                          return new Date(currentSliderValue[1]).toISOString().slice(0, 10);
                        }
                        // Use plot dates if available, otherwise dateRange
                        return plot.dateMax || dateRange.max || '';
                      })()}
                      min={dateRange.min || '2023-10-23'}
                      max={dateRange.max || getTodayDate()}
                      onChange={(e) => {
                        // TESTING: Only update sliderValues state, NO chart updates, NO plot.dateMin/dateMax access
                        const newDateMax = e.target.value;
                        if (!newDateMax) return;
                        const newDateMaxTime = new Date(newDateMax).getTime();
                        const currentSliderValue = sliderValues[plot.id];
                        if (currentSliderValue) {
                          setSliderValues(prev => ({
                            ...prev,
                            [plot.id]: [currentSliderValue[0], newDateMaxTime]
                          }));
                        } else {
                          // Initialize from plot dates or dateRange
                          const minTime = plot.dateMin 
                            ? new Date(plot.dateMin).getTime()
                            : (dateRange.min ? new Date(dateRange.min).getTime() : 0);
                          setSliderValues(prev => ({
                            ...prev,
                            [plot.id]: [minTime, newDateMaxTime]
                          }));
                        }
                      }}
                      disabled={false}
                    />
                    <button
                      className="apply-date-btn"
                      onClick={() => {
                        const currentSliderValue = sliderValues[plot.id];
                        if (!currentSliderValue) return;
                        
                        // Convert slider timestamps to YYYY-MM-DD format
                        const newDateMin = new Date(currentSliderValue[0]).toISOString().slice(0, 10);
                        const newDateMax = new Date(currentSliderValue[1]).toISOString().slice(0, 10);
                        
                        // Validate dates
                        if (newDateMin > newDateMax) {
                          alert('Min date cannot be greater than max date');
                          return;
                        }
                        
                        // Update plot state
                        updatePlot(plot.id, { dateMin: newDateMin, dateMax: newDateMax });
                        
                        // Clear temporary slider value so it shows the applied dates
                        setSliderValues(prev => {
                          const updated = { ...prev };
                          delete updated[plot.id];
                          return updated;
                        });
                        
                        // Trigger data refetch with new date range (use plot from closure, not state)
                        const version = plot.version || 'v1';
                        fetchPlotParameter(plot.dataType, plot.parameter, newDateMin, newDateMax, version);
                      }}
                      disabled={(() => {
                        const currentSliderValue = sliderValues[plot.id];
                        if (!currentSliderValue) return true;
                        const newDateMin = new Date(currentSliderValue[0]).toISOString().slice(0, 10);
                        const newDateMax = new Date(currentSliderValue[1]).toISOString().slice(0, 10);
                        // Enable if dates have changed
                        return newDateMin === (plot.dateMin || dateRange.min) && 
                               newDateMax === (plot.dateMax || dateRange.max);
                      })()}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              <div className="detailed-selection-section">
                <button
                  className="detailed-selection-toggle"
                  onClick={() => updatePlot(plot.id, { expanded: !plot.expanded })}
                >
                  {plot.expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  Detailed Selection
                </button>

                {plot.expanded && (
                  <div className="detailed-selection-content">
                    {availableUnits.length > 0 && (
                      <div className="control-group compact">
                  <label>Units ({plot.units.length}/{availableUnits.length}):</label>
                  <div className="selection-controls">
                    <button 
                      className="select-all-btn"
                      onClick={() => toggleAllSelection(plot.id, 'units', availableUnits)}
                    >
                      {availableUnits.every(unit => plot.units.includes(unit)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <div className="checkbox-group compact">
                      {availableUnits.map(unit => (
                        <label key={unit}>
                          <input
                            type="checkbox"
                            checked={plot.units.includes(unit)}
                            onChange={() => toggleSelection(plot.id, 'units', unit)}
                          />
                          {unit}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

                    {availableFilters.length > 0 && (plot.dataType === 'flat' || plot.dataType === 'science') && (
                      <div className="control-group compact">
                        <label>Filters ({plot.filters.length}/{availableFilters.length}):</label>
                        <div className="selection-controls">
                          <button 
                            className="select-all-btn"
                            onClick={() => toggleAllSelection(plot.id, 'filters', availableFilters)}
                          >
                            {availableFilters.every(filter => plot.filters.includes(filter)) ? 'Deselect All' : 'Select All'}
                          </button>
                          <div className="checkbox-group compact">
                            {availableFilters.map(filter => (
                              <label key={filter}>
                                <input
                                  type="checkbox"
                                  checked={plot.filters.includes(filter)}
                                  onChange={() => toggleSelection(plot.id, 'filters', filter)}
                                />
                                {filter}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {availableObjects.length > 0 && plot.dataType === 'science' && (
                      <div className="control-group compact">
                        <label>Objects ({plot.objects.length}/{availableObjects.length}):</label>
                        <Autocomplete
                          multiple
                          options={availableObjects}
                          value={plot.objects}
                          onChange={(event, newValue) => {
                            updatePlot(plot.id, { objects: newValue });
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder="Type to filter objects..."
                              size="small"
                            />
                          )}
                        />
                      </div>
                    )}

                    {availableInstLogParts.length > 0 && (
                      <div className="control-group compact">
                        <label>Instrument Log ({plot.instLogParts.length}/{availableInstLogParts.length}):</label>
                        <div className="selection-controls">
                          <button 
                            className="select-all-btn"
                            onClick={() => toggleAllSelection(plot.id, 'instLogParts', availableInstLogParts)}
                          >
                            {availableInstLogParts.every(part => plot.instLogParts.includes(part)) ? 'Deselect All' : 'Select All'}
                          </button>
                          <div className="checkbox-group compact">
                            {availableInstLogParts.map(part => (
                              <label key={part} className="inst-log-label">
                                <input
                                  type="checkbox"
                                  checked={plot.instLogParts.includes(part)}
                                  onChange={() => toggleSelection(plot.id, 'instLogParts', part)}
                                />
                                <span 
                                  className="inst-log-color-indicator"
                                  style={{ backgroundColor: getPartColor(part) }}
                                ></span>
                                {part}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="plot-container">
            <div className={`plot-placeholder ${plot.chartType === 'histogram' ? 'plot-placeholder-histogram' : ''}`}>
              <div 
                data-chart-key={`${plot.id}-${plot.dataType}-${plot.parameter}-${plot.chartType}-${plot.instLogParts.join(',')}`}
                className={`plot-chart-container ${plot.chartType === 'histogram' ? 'plot-chart-container-histogram' : ''}`}
              >
                {(() => {
                  // Show loading message if no data is available yet
                  if (Object.keys(plotData).length === 0) {
                    return (
                      <div className="loading-message">
                        Loading plot data...
                      </div>
                    );
                  }
                  
                  // Use memoized chart data (only recalculates when dependencies change)
                  const chartData = memoizedChartData[plot.id];
                  
                  // Use memoized ChartRenderer component - won't re-render when sliderValues changes
                  return (
                    <ChartRenderer
                      plot={plot}
                      chartData={chartData}
                      plotData={plotData}
                      loadingStates={loadingStates}
                      getParametersForDataType={(dataType) => getParametersForDataType(dataType, plot.version || 'v1')}
                      getInstLogAnnotations={getInstLogAnnotations}
                      getCutoffAnnotations={getCutoffAnnotations}
                      toChileLocalTime={toChileLocalTime}
                      toChileLocalDate={toChileLocalDate}
                      pipelineVersion={plot.version || 'v1'}
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default QA;
