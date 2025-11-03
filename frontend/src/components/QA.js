import React, { useEffect, useState } from 'react';
import '../styles/QA.css';
import { baseurl, parametersByDataType, dataTypeOptions } from '../config';
import { Line, Bar } from 'react-chartjs-2';
import { getLineChartOptions, getBarChartOptions, getYearChangeAnnotations, tooltipTitleCallback, CHART_DIMENSIONS, TABLEAU_20 } from '../utils/Plotting';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Slider from '@mui/material/Slider';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

function QA() {
  const [plotData, setPlotData] = useState({});
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
      dateMin: null,
      dateMax: null,
      instLogParts: [], // Selected instrument log parts
      expanded: false // Whether detailed selection is expanded
    }
  ]);
  const [dateRange, setDateRange] = useState({ min: null, max: null });

  // Function to get parameters for a specific data type
  const getParametersForDataType = (dataType) => {
    return parametersByDataType[dataType] || [];
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

  // Convert date from YYMMDD format to ISO format (YYYY-MM-DD)
  const convertInstLogDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return null;
    const year = '20' + dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);
    return `${year}-${month}-${day}`;
  };

  // Extract unit number from unit string (e.g., "7DT01" -> "1", "7DT1" -> "1")
  const extractUnitNumber = (unitStr) => {
    if (!unitStr) return null;
    const str = String(unitStr);
    // Try to match pattern like "7DT01" or "7DT1" - extract the number part
    const match = str.match(/(\d+)$/);
    if (match) {
      // Convert to number and back to string to remove leading zeros (e.g., "01" -> "1")
      return String(Number(match[1]));
    }
    // If no pattern match, try to extract any number
    const numMatch = str.match(/\d+/);
    return numMatch ? String(Number(numMatch[0])) : null;
  };

  // Get unit color based on unit order in the plot (matching chart colors)
  const getUnitColor = (unit, plotUnits) => {
    if (!plotUnits || plotUnits.length === 0) {
      return '#17becf'; // Default color
    }
    // Get the index of the unit in the sorted plot units array
    const unitIndex = plotUnits.indexOf(unit);
    if (unitIndex === -1) {
      return '#17becf'; // Default color if unit not found
    }
    // Use the same color palette as the chart
    return TABLEAU_20[unitIndex % TABLEAU_20.length];
  };

  // Get instrument log annotations for the chart
  const getInstLogAnnotations = (plot) => {
    const { instLogParts, units } = plot;
    
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

  // Get color for instrument log part type
  const getPartColor = (part) => {
    const colorMap = {
      'cam': '#d62728',
      'fw': '#ff7f0e',
      'mount': '#2ca02c',
      'mirror': '#9467bd',
      'motor': '#8c564b',
      'focuser': '#e377c2',
      'filt_config': '#7f7f7f'
    };
    return colorMap[part] || '#17becf';
  };


  useEffect(() => {
    // Fetch data for all plot types
    const fetchData = async () => {
      try {
        const [biasRes, darkRes, flatRes, scienceRes, instLogRes, masterframeConfigRes, scienceConfigRes] = await Promise.all([
          fetch(baseurl + '/plot?type=bias'),
          fetch(baseurl + '/plot?type=dark'),
          fetch(baseurl + '/plot?type=flat'),
          fetch(baseurl + '/plot?type=science'),
          fetch(baseurl + '/inst-log'),
          fetch(baseurl + '/qa-config?type=masterframe'),
          fetch(baseurl + '/qa-config?type=science')
        ]);

        const [biasData, darkData, flatData, scienceData, instLogDataResponse, masterframeConfig, scienceConfig] = await Promise.all([
          biasRes.json(),
          darkRes.json(),
          flatRes.json(),
          scienceRes.json(),
          instLogRes.json(),
          masterframeConfigRes.json(),
          scienceConfigRes.json()
        ]);

        const allData = {
          bias: biasData.error ? [] : biasData,
          dark: darkData.error ? [] : darkData,
          flat: flatData.error ? [] : flatData,
          science: scienceData.error ? [] : scienceData
        };

        setPlotData(allData);

        // Process QA config data
        // API returns: { success: true, type: "masterframe", data: { BIAS: {...}, DARK: {...}, ... } }
        // Store the full response, getCutoffAnnotations will extract the data property
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

        // Extract available units, filters, and objects
        const units = new Set();
        const filters = new Set();
        const objects = new Set();

        Object.values(allData).forEach(dataArray => {
          if (Array.isArray(dataArray)) {
            dataArray.forEach(entry => {
              if (entry.unit) units.add(entry.unit);
              if (entry.filter) filters.add(entry.filter);
              if (entry.object) objects.add(entry.object);
            });
          }
        });

        const sortedUnits = Array.from(units).sort();
        const sortedFilters = Array.from(filters).sort();
        const sortedObjects = Array.from(objects).sort();
        
        setAvailableUnits(sortedUnits);
        setAvailableFilters(sortedFilters);
        setAvailableObjects(sortedObjects);

        // Calculate date range from all data
        const allDates = [];
        Object.values(allData).forEach(dataArray => {
          if (Array.isArray(dataArray)) {
            dataArray.forEach(entry => {
              if (entry.run_date) {
                allDates.push(new Date(entry.run_date));
              }
            });
          }
        });

        const dateMin = allDates.length > 0 ? new Date(Math.min(...allDates)).toISOString().slice(0, 10) : null;
        const dateMax = allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString().slice(0, 10) : null;
        setDateRange({ min: dateMin, max: dateMax });

        // Set all units as selected by default for existing plots
        setPlots(prevPlots => prevPlots.map(plot => ({
          ...plot,
          units: plot.units.length === 0 ? [...sortedUnits] : plot.units,
          filters: plot.filters.length === 0 ? [...sortedFilters] : plot.filters,
          objects: plot.objects.length === 0 ? [] : plot.objects,
          dateMin: plot.dateMin || dateMin,
          dateMax: plot.dateMax || dateMax
        })));

      } catch (error) {
        console.error('Error fetching plot data:', error);
      }
    };

    fetchData();
  }, []);

  const addPlot = () => {
    const newId = Math.max(...plots.map(p => p.id), 0) + 1;
    const scienceParams = getParametersForDataType('science');
    setPlots([...plots, {
      id: newId,
      dataType: 'science',
      parameter: scienceParams.length > 0 ? scienceParams[0].value : 'seeing',
      units: [...availableUnits], // Select all units by default
      filters: [...availableFilters], // Select all filters by default
      objects: [], // Start with no objects selected by default
      chartType: 'line',
      enabled: true,
      dateMin: dateRange.min,
      dateMax: dateRange.max,
      instLogParts: [], // Start with no instrument log parts selected
      expanded: false // Start collapsed
    }]);
  };

  const removePlot = (plotId) => {
    if (plots.length > 1) {
      setPlots(plots.filter(p => p.id !== plotId));
    }
  };

  const updatePlot = (plotId, updates) => {
    setPlots(plots.map(p => p.id === plotId ? { ...p, ...updates } : p));
  };

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
    const { dataType, parameter, units, filters, objects, dateMin, dateMax } = plot;
    
    // Get all data and filter by qa_type
    let allData = [];
    Object.values(plotData).forEach(dataArray => {
      if (Array.isArray(dataArray)) {
        allData = allData.concat(dataArray);
      }
    });
    
    // Filter data by qa_type to match the selected dataType
    const dataSource = allData.filter(entry => entry.qa_type === dataType);

    // Return empty datasets if no data
    if (!dataSource || dataSource.length === 0) {
      return { datasets: [] };
    }

    // Filter data based on selections
    let filteredData = dataSource;
    
    if (units.length > 0) {
      filteredData = filteredData.filter(entry => units.includes(entry.unit));
    }
    
    // Only apply filter filtering for flat and science data types
    if (filters.length > 0 && (dataType === 'flat' || dataType === 'science')) {
      filteredData = filteredData.filter(entry => filters.includes(entry.filter));
    }
    
    // Only apply object filtering for science data type
    if (objects.length > 0 && dataType === 'science') {
      filteredData = filteredData.filter(entry => objects.includes(entry.object));
    }
    
    // Filter by date range
    if (dateMin || dateMax) {
      filteredData = filteredData.filter(entry => {
        if (!entry.run_date) return false;
        
        const entryDate = new Date(entry.run_date).toISOString().slice(0, 10);
        
        if (dateMin && entryDate < dateMin) return false;
        if (dateMax && entryDate > dateMax) return false;
        return true;
      });
    }

    // Return empty datasets if no filtered data
    if (!filteredData || filteredData.length === 0) {
      return { datasets: [] };
    }

    // Group by unit for plotting
    const unitData = {};
    filteredData.forEach(entry => {
      const unit = entry.unit || 'Unknown';
      if (!unitData[unit]) {
        unitData[unit] = [];
      }
      unitData[unit].push(entry);
    });

    const datasets = Object.keys(unitData).map((unit, idx) => {
      const color = TABLEAU_20[idx % TABLEAU_20.length];
      const entries = unitData[unit];
      
      // Sort entries by date
      entries.sort((a, b) => {
        const dateA = a.run_date ? new Date(a.run_date) : new Date(0);
        const dateB = b.run_date ? new Date(b.run_date) : new Date(0);
        return dateA - dateB;
      });

      const data = entries.map(entry => {
        let y, std;
        
        // Get the parameter value
        y = entry[parameter] || 0;
        
        // For parameters with error bars, use appropriate std
        if (parameter === 'clipmed' && entry.clipstd) {
          std = entry.clipstd;
        } else if (parameter === 'clipmax' && entry.clipstd) {
          std = entry.clipstd;
        } else if (parameter === 'clipmin' && entry.clipstd) {
          std = entry.clipstd;
        } else {
          std = 0;
        }
        
        // Extract date
        let date;
        if (entry.run_date) {
          date = new Date(entry.run_date).toISOString().slice(0, 10);
        } else {
          date = new Date().toISOString().slice(0, 10);
        }

        return {
          x: date,
          y,
          yMin: y - std,
          yMax: y + std,
          std: std,
          filter: entry.filter || '',
          sanity: entry.sanity,
        };
      });

      // Check if any data points have error bars
      const hasErrorBars = data.some(point => point.std > 0);

      return {
        label: unit,
        data,
        borderColor: color,
        backgroundColor: color,
        errorBarColor: color,
        errorBarWhiskerColor: color,
        errorBarWhiskerSize: 3,
        type: hasErrorBars ? 'lineWithErrorBars' : 'scatter',
        showLine: false,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointStyle: data.map(point => point.sanity === false ? 'crossRot' : 'circle'),
      };
    });

    return { datasets };
  };

  const getHistogramData = (plot) => {
    const { dataType, parameter, units, filters, objects, dateMin, dateMax } = plot;
    
    // Get all data and filter by qa_type
    let allData = [];
    Object.values(plotData).forEach(dataArray => {
      if (Array.isArray(dataArray)) {
        allData = allData.concat(dataArray);
      }
    });
    
    // Filter data by qa_type to match the selected dataType
    const dataSource = allData.filter(entry => entry.qa_type === dataType);

    // Return empty datasets if no data
    if (!dataSource || dataSource.length === 0) {
      return { datasets: [] };
    }

    // Filter data based on selections
    let filteredData = dataSource;
    
    if (units.length > 0) {
      filteredData = filteredData.filter(entry => units.includes(entry.unit));
    }
    
    // Only apply filter filtering for flat and science data types
    if (filters.length > 0 && (dataType === 'flat' || dataType === 'science')) {
      filteredData = filteredData.filter(entry => filters.includes(entry.filter));
    }
    
    // Only apply object filtering for science data type
    if (objects.length > 0 && dataType === 'science') {
      filteredData = filteredData.filter(entry => objects.includes(entry.object));
    }
    
    // Filter by date range
    if (dateMin || dateMax) {
      filteredData = filteredData.filter(entry => {
        if (!entry.run_date) return false;
        
        const entryDate = new Date(entry.run_date).toISOString().slice(0, 10);
        
        if (dateMin && entryDate < dateMin) return false;
        if (dateMax && entryDate > dateMax) return false;
        return true;
      });
    }

    // Return empty datasets if no filtered data
    if (!filteredData || filteredData.length === 0) {
      return { datasets: [] };
    }

    // Extract parameter values
    const values = filteredData
      .map(entry => entry[parameter])
      .filter(val => val !== null && val !== undefined && !isNaN(val));

    if (values.length === 0) {
      return { datasets: [] };
    }

    // Get parameter type for better binning
    const paramInfo = getParametersForDataType(dataType).find(p => p.value === parameter);
    const isInteger = paramInfo?.type === 'int';

    // Create histogram bins based on parameter type
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0).map((_, i) => {
      const binMin = min + i * binWidth;
      const binMax = min + (i + 1) * binWidth;
      const label = isInteger 
        ? `${Math.floor(binMin)}-${Math.floor(binMax)}`
        : `${binMin.toFixed(2)}-${binMax.toFixed(2)}`;
      
      return {
        label,
        value: binMin + binWidth / 2,
        count: 0
      };
    });

    // Count values in each bin
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      bins[binIndex].count++;
    });

    const datasets = [{
      label: `${getParametersForDataType(dataType).find(p => p.value === parameter)?.label || parameter} Distribution`,
      data: bins.map(bin => bin.count),
      backgroundColor: bins.map((_, i) => TABLEAU_20[i % TABLEAU_20.length] + '80'),
      borderColor: bins.map((_, i) => TABLEAU_20[i % TABLEAU_20.length]),
      borderWidth: 1,
    }];

    return { 
      datasets,
      labels: bins.map(bin => bin.label)
    };
  };

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

  // Export plot data to CSV
  const exportToCSV = (plot) => {
    const { dataType, parameter, units, filters, objects, dateMin, dateMax } = plot;
    
    // Get all data and filter by qa_type
    let allData = [];
    Object.values(plotData).forEach(dataArray => {
      if (Array.isArray(dataArray)) {
        allData = allData.concat(dataArray);
      }
    });
    
    // Filter data by qa_type to match the selected dataType
    const dataSource = allData.filter(entry => entry.qa_type === dataType);

    // Filter data based on selections
    let filteredData = dataSource;
    
    if (units.length > 0) {
      filteredData = filteredData.filter(entry => units.includes(entry.unit));
    }
    
    // Only apply filter filtering for flat and science data types
    if (filters.length > 0 && (dataType === 'flat' || dataType === 'science')) {
      filteredData = filteredData.filter(entry => filters.includes(entry.filter));
    }
    
    // Only apply object filtering for science data type
    if (objects.length > 0 && dataType === 'science') {
      filteredData = filteredData.filter(entry => objects.includes(entry.object));
    }
    
    // Filter by date range
    if (dateMin || dateMax) {
      filteredData = filteredData.filter(entry => {
        if (!entry.run_date) return false;
        
        const entryDate = new Date(entry.run_date).toISOString().slice(0, 10);
        
        if (dateMin && entryDate < dateMin) return false;
        if (dateMax && entryDate > dateMax) return false;
        return true;
      });
    }

    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    // Sort by date
    filteredData.sort((a, b) => {
      const dateA = a.run_date ? new Date(a.run_date) : new Date(0);
      const dateB = b.run_date ? new Date(b.run_date) : new Date(0);
      return dateA - dateB;
    });

    // Prepare CSV headers
    const paramInfo = getParametersForDataType(dataType).find(p => p.value === parameter);
    const paramLabel = paramInfo?.label || parameter.toUpperCase();
    
    const headers = ['DATE-OBS', 'UNIT', paramLabel];
    if (dataType === 'flat' || dataType === 'science') {
      headers.push('FILTER');
    }
    if (dataType === 'science') {
      headers.push('OBJECT');
    }

    // Build CSV rows
    const rows = filteredData.map(entry => {
      const row = [];
      
      // DATE-OBS
      const date = entry.run_date ? new Date(entry.run_date).toISOString().slice(0, 10) : '';
      row.push(date);
      
      // UNIT
      row.push(entry.unit || '');
      
      // Parameter value
      const value = entry[parameter];
      row.push(value !== null && value !== undefined ? value : '');
      
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="export-csv-btn"
                  onClick={() => exportToCSV(plot)}
                >
                  <FileDownloadIcon fontSize="small" />
                  Export CSV
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
                  <label>Data Type:</label>
                  <select 
                    value={plot.dataType} 
                    onChange={(e) => {
                      const newDataType = e.target.value;
                      const availableParams = getParametersForDataType(newDataType);
                      // Add a small delay to prevent chart rendering issues
                      setTimeout(() => {
                        updatePlot(plot.id, { 
                          dataType: newDataType,
                          parameter: availableParams.length > 0 ? availableParams[0].value : ''
                        });
                      }, 10);
                    }}
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
                    {getParametersForDataType(plot.dataType).map(param => (
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

                <div className="control-group" style={{ flex: 1, minWidth: '200px' }}>
                  <label>Date Range:</label>
                  <div style={{ marginTop: '8px' }}>
                    <Slider
                      getAriaLabel={() => 'Date range'}
                      value={dateRange.min && dateRange.max ? [
                        new Date(plot.dateMin || dateRange.min).getTime(),
                        new Date(plot.dateMax || dateRange.max).getTime()
                      ] : [0, 1]}
                      onChange={(e, newValue) => {
                        const newDateMin = new Date(newValue[0]).toISOString().slice(0, 10);
                        const newDateMax = new Date(newValue[1]).toISOString().slice(0, 10);
                        updatePlot(plot.id, { dateMin: newDateMin, dateMax: newDateMax });
                      }}
                      valueLabelDisplay="auto"
                      min={dateRange.min ? new Date(dateRange.min).getTime() : 0}
                      max={dateRange.max ? new Date(dateRange.max).getTime() : 1}
                      getAriaValueText={(value) => new Date(value).toISOString().slice(0, 10)}
                      valueLabelFormat={(value) => new Date(value).toISOString().slice(0, 10)}
                      disabled={!dateRange.min || !dateRange.max}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '2px' }}>
                      <span>{plot.dateMin || dateRange.min || 'N/A'}</span>
                      <span>{plot.dateMax || dateRange.max || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 0',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#333'
                  }}
                  onClick={() => updatePlot(plot.id, { expanded: !plot.expanded })}
                >
                  {plot.expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  Detailed Selection
                </button>

                {plot.expanded && (
                  <div style={{ marginTop: '12px' }}>
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
                              <label key={part} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="checkbox"
                                  checked={plot.instLogParts.includes(part)}
                                  onChange={() => toggleSelection(plot.id, 'instLogParts', part)}
                                />
                                <span style={{ 
                                  display: 'inline-block', 
                                  width: '8px', 
                                  height: '8px', 
                                  backgroundColor: getPartColor(part),
                                  borderRadius: '2px',
                                  marginRight: '4px'
                                }}></span>
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
            <div className="plot-placeholder" style={{ 
              overflowX: plot.chartType === 'histogram' ? 'visible' : 'auto', 
              width: '100%' 
            }}>
              <div style={{ 
                minWidth: plot.chartType === 'histogram' ? 'auto' : 2000, 
                maxWidth: plot.chartType === 'histogram' ? '800px' : 'none',
                margin: plot.chartType === 'histogram' ? '0 auto' : '0'
              }}>
                {(() => {
                  // Show loading message if no data is available yet
                  if (Object.keys(plotData).length === 0) {
                    return (
                      <div className="loading-message">
                        Loading plot data...
                      </div>
                    );
                  }
                  
                  // Get chart data based on chart type
                  const chartData = plot.chartType === 'histogram' ? getHistogramData(plot) : getChartData(plot);
                  
                  // Show error message if no datasets after filtering
                  if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
                    const dataTypeMsg = plot.dataType === 'flat' || plot.dataType === 'science' 
                      ? ', filter' + (plot.dataType === 'science' ? ', or object' : '')
                      : '';
                    return (
                      <div className="error-message">
                        No data available for the selected parameters. Please adjust your unit{dataTypeMsg} selections.
                      </div>
                    );
                  }
                  
                  // Additional validation for chart data
                  const hasValidData = chartData.datasets.some(dataset => 
                    dataset.data && Array.isArray(dataset.data) && dataset.data.length > 0
                  );
                  
                  if (!hasValidData) {
                    return (
                      <div className="error-message">
                        No valid data points found for the selected parameters. Please check your data type and parameter selection.
                      </div>
                    );
                  }
                  
                  // Validate that the parameter exists in the current data type
                  const currentParams = getParametersForDataType(plot.dataType);
                  const paramExists = currentParams.some(p => p.value === plot.parameter);
                  
                  if (!paramExists) {
                    return (
                      <div className="error-message">
                        Invalid parameter for selected data type. Please select a valid parameter.
                      </div>
                    );
                  }
                  
                  // Render the chart
                  try {
                    // Create a unique key to force chart re-render when data type or parameter changes
                    const chartKey = `${plot.id}-${plot.dataType}-${plot.parameter}-${plot.chartType}-${plot.instLogParts.join(',')}`;
                    
                    if (plot.chartType === 'histogram') {
                      return (
                        <Bar
                          key={chartKey}
                          data={{
                            labels: chartData.labels || [],
                            datasets: chartData.datasets
                          }}
                          options={getBarChartOptions(getParametersForDataType(plot.dataType).find(p => p.value === plot.parameter)?.label || plot.parameter)}
                          height={CHART_DIMENSIONS.BAR_CHART.height}
                        />
                      );
                    } else {
                      // Merge inst-log annotations with existing annotations
                      const baseOptions = getLineChartOptions(
                        `${getParametersForDataType(plot.dataType).find(p => p.value === plot.parameter)?.label || plot.parameter} vs DATE-OBS`,
                        plotData[plot.dataType] || [],
                        plot.dataType
                      );
                      const instLogAnnotations = getInstLogAnnotations(plot);
                      const cutoffAnnotations = getCutoffAnnotations(plot);
                      
                      // Merge annotations - getYearChangeAnnotations returns { annotations: {...} }
                      // Put year annotations last so they draw on top of other annotations
                      const existingAnnotations = baseOptions.plugins.annotation?.annotations || {};
                      const mergedAnnotations = {
                        annotations: {
                          ...instLogAnnotations,
                          ...cutoffAnnotations,
                          ...existingAnnotations
                        }
                      };

                      const mergedOptions = {
                        ...baseOptions,
                        plugins: {
                          ...baseOptions.plugins,
                          annotation: {
                            ...mergedAnnotations,
                            interaction: {
                              mode: 'nearest',
                              intersect: false
                            }
                          }
                        }
                      };

                      return (
                        <Line
                          key={chartKey}
                          data={chartData}
                          options={mergedOptions}
                          width={CHART_DIMENSIONS.LINE_CHART.width}
                          height={CHART_DIMENSIONS.LINE_CHART.height}
                        />
                      );
                    }
                  } catch (error) {
                    console.error('Chart rendering error:', error);
                    return (
                      <div className="error-message">
                        Error rendering chart. Please try refreshing the page.
                      </div>
                    );
                  }
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
