import { TABLEAU_20 } from './Plotting';

// ============================================================================
// Date utilities
// ============================================================================
export const toChileLocalTime = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

export const toChileLocalDate = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
};

export const convertInstLogDate = (dateStr) => {
  if (!dateStr || dateStr.length !== 6) return null;
  const year = '20' + dateStr.substring(0, 2);
  const month = dateStr.substring(2, 4);
  const day = dateStr.substring(4, 6);
  return `${year}-${month}-${day}`;
};

// Unit utilities
export const extractUnitNumber = (unitStr) => {
  if (!unitStr) return null;
  const str = String(unitStr);
  const match = str.match(/(\d+)$/);
  if (match) return String(Number(match[1]));
  const numMatch = str.match(/\d+/);
  return numMatch ? String(Number(numMatch[0])) : null;
};

export const getPartColor = (part) => {
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

// Data filtering utilities
export const filterDataBySelections = (data, dataType, units, filters, objects) => {
  let filtered = data;
  
  if (units.length > 0) {
    filtered = filtered.filter(entry => units.includes(entry.unit));
  }
  
  if (filters.length > 0 && (dataType === 'flat' || dataType === 'science')) {
    filtered = filtered.filter(entry => filters.includes(entry.filter));
  }
  
  if (objects.length > 0 && dataType === 'science') {
    filtered = filtered.filter(entry => objects.includes(entry.object));
  }
  
  return filtered;
};

// Get date field based on data type
export const getDateField = (entry, dataType) => {
  return dataType === 'science' ? entry.date_obs : entry.run_date;
};

// Format date for chart
export const formatChartDate = (dateField, dataType) => {
  if (!dateField) return new Date().toISOString().slice(0, 10);
  if (dataType === 'science') {
    return new Date(dateField).toISOString();
  }
  return new Date(dateField).toISOString().slice(0, 10);
};

// Get parameter value and std
export const getParameterValue = (entry, parameter) => {
  const y = entry[parameter] || 0;
  const hasStd = ['clipmed', 'clipmax', 'clipmin'].includes(parameter);
  const std = hasStd && entry.clipstd ? entry.clipstd : 0;
  return { y, std };
};

// ============================================================================
// Data transformation utilities
// ============================================================================

// Helper function to group data by series (shared by line charts and box plots)
const groupDataBySeries = (filteredData, dataType) => {
  const groupedData = {};
  if (dataType === 'science') {
    filteredData.forEach(entry => {
      let label;
      // Check each entry individually for object and unit
      if (entry.object) {
        if (entry.unit) {
          label = `${entry.object} (${entry.unit}, ${entry.filter || 'Unknown'})`;
        } else {
          label = `${entry.object} (${entry.filter || 'Unknown'})`;
        }
      } else if (entry.unit) {
        label = `${entry.unit} (${entry.filter || 'Unknown'})`;
      } else {
        label = `${entry.filter || 'Unknown'}`;
        
      }
      
      if (!groupedData[label]) groupedData[label] = [];
      groupedData[label].push(entry);
    });
  } else {
    filteredData.forEach(entry => {
      const unit = entry.unit || 'Unknown';
      if (!groupedData[unit]) groupedData[unit] = [];
      groupedData[unit].push(entry);
    });
  }
  return groupedData;
};

// Helper function to filter and validate data (shared by line charts and box plots)
const filterAndValidateData = (dataSource, plot) => {
  if (!dataSource || dataSource.length === 0) {
    return null;
  }
  const { dataType, units, filters, objects } = plot;
  const filteredData = filterDataBySelections(dataSource, dataType, units, filters, objects);
  if (filteredData.length === 0) {
    return null;
  }
  return filteredData;
};

// Transform data for line chart
export const transformChartData = (dataSource, plot, getParametersForDataType) => {
  const { dataType, parameter } = plot;
  
  const filteredData = filterAndValidateData(dataSource, plot);
  if (!filteredData) {
    return { datasets: [] };
  }

  // Group data
  const groupedData = groupDataBySeries(filteredData, dataType);

  // Get all available units from the data source and sort them
  // This ensures consistent color assignment based on unit's position in sorted list of all units
  const allUnitsSet = new Set();
  dataSource.forEach(entry => {
    if (entry.unit) allUnitsSet.add(entry.unit);
  });
  const allUnitsSorted = Array.from(allUnitsSet).sort();
  const unitColorMap = {};
  allUnitsSorted.forEach((unit, idx) => {
    unitColorMap[unit] = TABLEAU_20[idx % TABLEAU_20.length];
  });

  // For non-science data, sort keys by unit to match Overview.js color assignment
  const sortedKeys = dataType === 'science' 
    ? Object.keys(groupedData) 
    : Object.keys(groupedData).sort();

  // Create datasets
  const datasets = sortedKeys.map((label, idx) => {
    // Use unit-based color mapping for consistency
    // Extract unit from entries (first entry in the group)
    const entries = groupedData[label];
    const firstEntry = entries[0];
    const unit = firstEntry?.unit || null;
    const color = unit ? (unitColorMap[unit] || TABLEAU_20[idx % TABLEAU_20.length]) : TABLEAU_20[idx % TABLEAU_20.length];
    
    // Sort by date
    entries.sort((a, b) => {
      const dateA = new Date(getDateField(a, dataType) || 0);
      const dateB = new Date(getDateField(b, dataType) || 0);
      return dateA - dateB;
    });

    const data = entries.map(entry => {
      const { y, std } = getParameterValue(entry, parameter);
      const dateField = getDateField(entry, dataType);
      
      return {
        x: formatChartDate(dateField, dataType),
        y,
        yMin: y - std,
        yMax: y + std,
        std,
        filter: entry.filter || '',
        sanity: entry.sanity,
      };
    });

    const hasErrorBars = data.some(point => point.std > 0);

    return {
      label,
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

// Transform data for histogram
export const transformHistogramData = (dataSource, plot, getParametersForDataType) => {
  const { dataType, parameter, units, filters, objects } = plot;
  
  if (!dataSource || dataSource.length === 0) {
    return { datasets: [] };
  }

  const filteredData = filterDataBySelections(dataSource, dataType, units, filters, objects);
  
  if (filteredData.length === 0) {
    return { datasets: [] };
  }

  const values = filteredData
    .map(entry => {
      // Use median if available, otherwise use the parameter value
      if (entry.median !== null && entry.median !== undefined && !isNaN(entry.median)) {
        return entry.median;
      }
      return entry[parameter];
    })
    .filter(val => val !== null && val !== undefined && !isNaN(val));

  if (values.length === 0) {
    return { datasets: [] };
  }

  const paramInfo = getParametersForDataType(dataType).find(p => p.value === parameter);
  const isInteger = paramInfo?.type === 'int';

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
    
    return { label, value: binMin + binWidth / 2, count: 0 };
  });

  values.forEach(value => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    bins[binIndex].count++;
  });

  // Calculate statistics
  const sortedValues = [...values].sort((a, b) => a - b);
  const n = sortedValues.length;
  
  // Mean
  const mean = values.reduce((sum, val) => sum + val, 0) / n;
  
  // Standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  // Median
  const median = n % 2 === 0
    ? (sortedValues[n / 2 - 1] + sortedValues[n / 2]) / 2
    : sortedValues[Math.floor(n / 2)];
  
  // Q1 (25th percentile)
  const q1Index = Math.floor(n * 0.25);
  const q1 = n % 4 === 0
    ? (sortedValues[q1Index - 1] + sortedValues[q1Index]) / 2
    : sortedValues[q1Index];
  
  // Q3 (75th percentile)
  const q3Index = Math.floor(n * 0.75);
  const q3 = n % 4 === 0
    ? (sortedValues[q3Index - 1] + sortedValues[q3Index]) / 2
    : sortedValues[q3Index];

  return {
    datasets: [{
      label: `${paramInfo?.label || parameter} Distribution`,
      data: bins.map(bin => bin.count),
      backgroundColor: bins.map((_, i) => TABLEAU_20[i % TABLEAU_20.length] + '80'),
      borderColor: bins.map((_, i) => TABLEAU_20[i % TABLEAU_20.length]),
      borderWidth: 1,
    }],
    labels: bins.map(bin => bin.label),
    statistics: {
      median,
      mean,
      std,
      q1,
      q3
    }
  };
};

// Check if data has box plot properties
export const hasBoxPlotData = (dataSource) => {
  if (!dataSource || !Array.isArray(dataSource)) return false;
  return dataSource.some(entry => 
    entry.q1 !== null && entry.q1 !== undefined &&
    entry.q3 !== null && entry.q3 !== undefined &&
    entry.min !== null && entry.min !== undefined &&
    entry.max !== null && entry.max !== undefined
  );
};

// Transform data for line chart with floating bars (min-max range) using box plot statistics
export const transformBoxPlotData = (dataSource, plot, getParametersForDataType) => {
  const { dataType } = plot;
  
  if (!dataSource || !Array.isArray(dataSource) || dataSource.length === 0) {
    return { datasets: [] };
  }

  // Filter by user selections (units, filters, objects)
  const filteredData = filterDataBySelections(
    dataSource, 
    dataType, 
    plot.units || [], 
    plot.filters || [], 
    plot.objects || []
  );

  if (filteredData.length === 0) {
    return { datasets: [] };
  }

  // Filter entries that have box plot statistics
  const boxPlotEntries = filteredData.filter(entry => 
    entry.q1 != null &&
    entry.q3 != null &&
    entry.min != null &&
    entry.max != null
  );

  if (boxPlotEntries.length === 0) {
    return { datasets: [] };
  }

  // Group data using the same scheme as line charts
  const groupedData = groupDataBySeries(boxPlotEntries, dataType);

  // Get all available units from the data source and sort them
  // This ensures consistent color assignment based on unit's position in sorted list of all units
  const allUnitsSet = new Set();
  dataSource.forEach(entry => {
    if (entry.unit) allUnitsSet.add(entry.unit);
  });
  const allUnitsSorted = Array.from(allUnitsSet).sort();
  const unitColorMap = {};
  allUnitsSorted.forEach((unit, idx) => {
    unitColorMap[unit] = TABLEAU_20[idx % TABLEAU_20.length];
  });

  // For non-science data, sort keys by unit to match Overview.js color assignment
  const sortedKeys = dataType === 'science' 
    ? Object.keys(groupedData) 
    : Object.keys(groupedData).sort();

  // Create datasets - one per series with median line and min-max error bars
  const datasets = [];
  sortedKeys.forEach((label, idx) => {
    const entries = groupedData[label];
    // Use unit-based color mapping for consistency
    // Extract unit from entries (first entry in the group)
    const firstEntry = entries[0];
    const unit = firstEntry?.unit || null;
    const color = unit ? (unitColorMap[unit] || TABLEAU_20[idx % TABLEAU_20.length]) : TABLEAU_20[idx % TABLEAU_20.length];
    
    // Sort by date
    entries.sort((a, b) => {
      const dateA = new Date(getDateField(a, dataType) || 0);
      const dateB = new Date(getDateField(b, dataType) || 0);
      return dateA - dateB;
    });

    // Convert each entry to line chart data point with error bars
    const data = entries.map(entry => {
      // Get date field and convert to timestamp for time scale
      const dateField = getDateField(entry, dataType);
      if (!dateField) {
        return null;
      }
      
      const timestamp = new Date(dateField).getTime();
      if (isNaN(timestamp)) {
        return null;
      }

      // Extract box plot statistics
      const min = entry.min;
      const q1 = entry.q1;
      const q3 = entry.q3;
      const max = entry.max;
      const median = entry.median != null ? entry.median : (q1 + q3) / 2;

      // Use median as y value, min-max as error bars
      // Error bars: yMin = min, yMax = max
      return {
        x: formatChartDate(dateField, dataType),
        y: median,
        yMin: min,
        yMax: max,
        std: (max - min) / 2, // For error bar display
        q1,
        q3,
        min,
        max,
        median
      };
    }).filter(d => d !== null); // Remove null entries

    if (data.length > 0) {
      // Create box (q1-q3) dataset
      const boxData = data.map(d => ({
        x: d.x,
        y: d.median,
        yMin: d.q1,
        yMax: d.q3,
        std: (d.q3 - d.q1) / 2,
        q1: d.q1,
        q3: d.q3,
        min: d.min,
        max: d.max,
        median: d.median
      }));

      // Create whiskers (min-max) dataset
      const whiskerData = data.map(d => ({
        x: d.x,
        y: d.median,
        yMin: d.min,
        yMax: d.max,
        std: (d.max - d.min) / 2,
        q1: d.q1,
        q3: d.q3,
        min: d.min,
        max: d.max,
        median: d.median
      }));

      // Box (q1-q3) - thicker, more visible, hidden from legend
      datasets.push({
        label: '', // Empty label to avoid creating legend entry
        data: boxData,
        borderColor: 'transparent', // Make line transparent
        backgroundColor: 'transparent',
        errorBarColor: color,
        errorBarWhiskerColor: color,
        errorBarWhiskerSize: 0, // No whiskers on box
        errorBarLineWidth: 4, // Thicker line for box
        type: 'lineWithErrorBars',
        showLine: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        borderWidth: 0, // No line width
      });

      // Whiskers (min-max) - thinner, with whiskers, visible in legend
      datasets.push({
        label: label, // Show only the original label (not "Min-Max")
        data: whiskerData,
        borderColor: 'transparent', // Make line transparent
        backgroundColor: 'transparent',
        errorBarColor: color,
        errorBarWhiskerColor: color,
        errorBarWhiskerSize: 3, // Whiskers on min-max
        errorBarLineWidth: 1, // Thinner line for whiskers
        type: 'lineWithErrorBars',
        showLine: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        borderWidth: 0, // No line width
      });
    }
  });

  return { datasets };
};

