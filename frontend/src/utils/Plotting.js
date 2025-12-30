// Shared plotting utilities for consistent chart rendering across components
import React, { memo } from 'react';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, BarElement } from 'chart.js';
import { LineWithErrorBarsChart, LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';
import { ScatterController } from 'chart.js';
import { TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line, Bar, Chart } from 'react-chartjs-2';
import { hasBoxPlotData, getDateField } from './QAUtils';
import '../styles/QA.css';

// Shared color palette for consistent chart styling
export const TABLEAU_20 = [
    "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c",
    "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5",
    "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f",
    "#c7c7c7", "#bcbd22", "#dbdb8d", "#17becf", "#9edae5"
];

// Register Chart.js components exactly like in _overview.js
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

// Register BarElement separately for histograms
ChartJS.register(BarElement);

// Year change annotations function - uses time scale for all charts
export const getYearChangeAnnotations = (plotData, dataType) => {
  if (!plotData || !Array.isArray(plotData)) return {};
  
  // Collect all dates from all entries using consistent date field selection
  const allDates = [];
  plotData.forEach(entry => {
    const dateField = getDateField(entry, dataType);
    if (dateField) {
      // Extract date part before timezone conversion to preserve local date
      // For strings with timezone offsets, extract YYYY-MM-DD from the beginning
      let dateStr = String(dateField);
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Extract date part (YYYY-MM-DD) from the beginning
        dateStr = dateStr.substring(0, 10);
      } else {
        // Fallback to Date conversion if format is different
        const d = new Date(dateField);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().slice(0, 10);
        } else {
          dateStr = null;
        }
      }
      if (dateStr) allDates.push(dateStr);
    } else if (entry.created_at) {
      // Fallback to created_at if primary date field is missing
      const date = new Date(entry.created_at).toISOString().slice(0, 10);
      if (date) allDates.push(date);
    }
  });
  
  // Get unique years, sorted
  const years = Array.from(new Set(allDates.map(d => d.slice(0, 4)))).sort();
  
  // For each year after the first, add a vertical line at Jan 1
  const annotations = {};
  for (let i = 1; i < years.length; i++) {
    const year = years[i];
    const yearDate = new Date(`${year}-01-01T00:00:00Z`).getTime();
    
    annotations[`yearline${year}`] = {
      type: 'line',
      xMin: yearDate,
      xMax: yearDate,
      xScaleID: 'x',
      borderColor: 'rgba(0, 0, 0, 0.5)',
      borderWidth: 2,
      borderDash: [6, 6],
      label: {
        display: true,
        content: year,
        position: 'start',
        color: 'white',
        font: { weight: 'bold' },
        backgroundColor: 'rgba(0, 0, 0, 0.5)'
      }
    };
  }
  
  return { annotations };
};

// Tooltip title callback copied exactly from _overview.js
export const tooltipTitleCallback = function(context) {
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

// Helper function to check if date range is less than 30 days
const isDateRangeLessThan30Days = (dateMin, dateMax) => {
  if (!dateMin || !dateMax) return false;
  const minDate = new Date(dateMin);
  const maxDate = new Date(dateMax);
  const diffTime = Math.abs(maxDate - minDate);
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays < 30;
};

// Common Chart.js options for line charts
export const getLineChartOptions = (title, plotData, dateMin = null, dateMax = null) => {
  const rangeLessThan30Days = isDateRangeLessThan30Days(dateMin, dateMax);
  
  return {
    responsive: false,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'top',
        labels: {
          sort: (a, b) => a.text.localeCompare(b.text)
        }
      },
      title: { display: true, text: title },
      annotation: getYearChangeAnnotations(plotData),
      tooltip: {
        callbacks: {
          title: tooltipTitleCallback,
          label: function(context) {
            const y = context.parsed.y;
            const std = context.raw.std;
            const label = context.dataset.label || '';
            if (std !== undefined && std > 0) {
              return `${label}: ${y.toFixed(3)} ± ${std.toFixed(3)}`;
            }
            return `${label}: ${y.toFixed(3)}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: rangeLessThan30Days ? 'hour' : 'day',
          displayFormats: { 
            day: 'MM-dd',
            hour: 'MM-dd HH:mm'
          }
        },
        title: { 
          display: true, 
          text: rangeLessThan30Days 
            ? 'Observation Date & Time (UTC)' 
            : 'Observation Date (UTC)' 
        },
        ticks: {
          maxRotation: 90,
          minRotation: 45,
          autoSkip: true,
          maxTicksLimit: 50,
          callback: function(value, index, ticks) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              if (rangeLessThan30Days) {
                return date.toLocaleString('en-US', {
                  timeZone: 'America/Santiago',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
              } else {
                return date.toLocaleDateString('en-US', {
                  timeZone: 'America/Santiago',
                  month: '2-digit',
                  day: '2-digit'
                });
              }
            }
            return value;
          }
        },
      },
      y: { 
        title: { 
          display: true, 
          text: title.split(' vs ')[0]
        },
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
  };
};

// Common Chart.js options for bar charts (histograms)
export const getBarChartOptions = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { 
      position: 'top',
      labels: {
        sort: (a, b) => a.text.localeCompare(b.text)
      }
    },
    title: { 
      display: true, 
      text: `${title} Distribution`
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          return `Count: ${context.parsed.y}`;
        }
      }
    }
  },
  scales: {
    x: {
      title: { display: true, text: `${title} Range` },
      ticks: { maxRotation: 45, minRotation: 0 }
    },
    y: { 
      title: { display: true, text: 'Count' },
      beginAtZero: true,
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
});

// Common Chart.js options for box plots
export const getBoxPlotChartOptions = (title, plotData, dataType, dateMin = null, dateMax = null) => {
  const rangeLessThan30Days = isDateRangeLessThan30Days(dateMin, dateMax);
  
  return {
    responsive: false,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'top',
        labels: {
          sort: (a, b) => a.text.localeCompare(b.text)
        }
      },
      title: { display: true, text: `${title} Box Plot` },
      annotation: getYearChangeAnnotations(plotData, dataType),
      tooltip: {
        callbacks: {
          title: function(context) {
            const timestamp = context[0].parsed.x;
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
              return date.toISOString().slice(0, 10);
            }
            return '';
          },
          label: function(context) {
            const datasetLabel = context.dataset.label || '';
            const raw = context.raw;
            if (raw && typeof raw === 'object' && raw.min !== undefined) {
              return [
                `${datasetLabel}:`,
                `min=${raw.min.toFixed(2)}`,
                `q1=${raw.q1.toFixed(2)}`,
                `median=${raw.median.toFixed(2)}`,
                `q3=${raw.q3.toFixed(2)}`,
                `max=${raw.max.toFixed(2)}`
              ];
            }
            return `${datasetLabel}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: rangeLessThan30Days ? 'hour' : 'day',
          displayFormats: { 
            day: 'MM-dd',
            hour: 'MM-dd HH:mm'
          }
        },
        title: { 
          display: true, 
          text: rangeLessThan30Days 
            ? 'Observation Date & Time' 
            : 'Observation Date' 
        },
        ticks: {
          maxRotation: 90,
          minRotation: 45,
          autoSkip: true,
          maxTicksLimit: 50,
          callback: function(value, index, ticks) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              if (rangeLessThan30Days) {
                return date.toLocaleString('en-US', {
                  timeZone: 'America/Santiago',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
              } else {
                return date.toLocaleDateString('en-US', {
                  timeZone: 'America/Santiago',
                  month: '2-digit',
                  day: '2-digit'
                });
              }
            }
            return value;
          }
        },
      },
      y: { 
        title: { 
          display: true, 
          text: title.split(' vs ')[0]
        },
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
  };
};

// Chart dimensions
export const CHART_DIMENSIONS = {
  LINE_CHART: {
    width: 2000,
    height: 400
  },
  BAR_CHART: {
    height: 400
  }
};

// Memoized chart renderer component to prevent re-renders when unrelated state changes
// This component only re-renders when chart data or plot properties actually change
export const ChartRenderer = memo(({ 
  plot, 
  chartData, 
  plotData, 
  loadingStates, 
  getParametersForDataType,
  getInstLogAnnotations,
  getCutoffAnnotations,
  toChileLocalTime,
  toChileLocalDate,
  pipelineVersion = 'v1'
}) => {
  if (!chartData) {
    const dataKey = `${plot.dataType}_${plot.parameter}`;
    if (loadingStates[dataKey]) {
      return (
        <div className="loading-message">
          Loading plot data...
        </div>
      );
    }
    return (
      <div className="loading-message">
        Loading plot data...
      </div>
    );
  }
  
  // Show error message if no datasets after filtering
  if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
    const dataTypeMsg = plot.dataType === 'flat' || plot.dataType === 'science' 
      ? ', filter' + (plot.dataType === 'science' ? ', or object' : '')
      : '';
    const unitMsg = plot.dataType === 'science' ? '' : ' unit';
    return (
      <div className="error-message">
        No data available for the selected parameters. Please adjust your{unitMsg}{dataTypeMsg} selections.
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
  const version = pipelineVersion || 'v1';
  const currentParams = getParametersForDataType(plot.dataType, version);
  const paramExists = currentParams.some(p => p.value === plot.parameter);
  
  if (!paramExists) {
    return (
      <div className="error-message">
        Invalid parameter for selected data type. Please select a valid parameter.
      </div>
    );
  }
  
  // Check if we should render a box plot
  const dataKey = `${plot.dataType}_${plot.parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${pipelineVersion}`;
  const rawData = plotData[dataKey] || [];
  const isBoxPlot = hasBoxPlotData(rawData) && plot.chartType !== 'histogram';
  
  // Render the chart
  try {
    // Create a unique key to force chart re-render when data type, parameter, or date range changes
    const chartKey = `${plot.id}-${plot.dataType}-${plot.parameter}-${plot.chartType}-${plot.dateMin || ''}-${plot.dateMax || ''}-${plot.units.join(',')}-${plot.filters.join(',')}-${plot.objects.join(',')}-${plot.instLogParts.join(',')}`;
    
    if (plot.chartType === 'histogram') {
      const statistics = chartData.statistics || {};
      return (
        <div className="chart-container">
          <Bar
            key={chartKey}
            data={{
              labels: chartData.labels || [],
              datasets: chartData.datasets
            }}
            options={getBarChartOptions(getParametersForDataType(plot.dataType, pipelineVersion || 'v1').find(p => p.value === plot.parameter)?.label || plot.parameter)}
            height={CHART_DIMENSIONS.BAR_CHART.height}
          />
          {statistics.median !== undefined && (
            <div className="chart-statistics-overlay">
              <div className="chart-statistics-title">Statistics:</div>
              <div>Median: {statistics.median.toFixed(3)}</div>
              <div>Mean: {statistics.mean.toFixed(3)}</div>
              <div>Std: {statistics.std.toFixed(3)}</div>
              <div>Q1: {statistics.q1.toFixed(3)}</div>
              <div>Q3: {statistics.q3.toFixed(3)}</div>
            </div>
          )}
        </div>
      );
    } else if (isBoxPlot) {
      // Render box plot using @sgratzl/chartjs-chart-boxplot
      // Use the actual raw data for year annotations
      const dataKey = `${plot.dataType}_${plot.parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${pipelineVersion}`;
      const rawDataForAnnotations = plotData[dataKey] || [];
      const baseOptions = getBoxPlotChartOptions(
        `${getParametersForDataType(plot.dataType, pipelineVersion || 'v1').find(p => p.value === plot.parameter)?.label || plot.parameter} vs DATE-OBS`,
        rawDataForAnnotations,
        plot.dataType,
        plot.dateMin,
        plot.dateMax
      );
      const instLogAnnotations = getInstLogAnnotations(plot);
      const cutoffAnnotations = getCutoffAnnotations(plot);
      
      // Get year annotations
      const yearAnnotations = getYearChangeAnnotations(rawDataForAnnotations, plot.dataType);
      
      const existingAnnotations = baseOptions.plugins.annotation?.annotations || {};
      const mergedAnnotations = {
        annotations: {
          ...instLogAnnotations,
          ...cutoffAnnotations,
          ...yearAnnotations.annotations, // Use year annotations with chart labels
          ...existingAnnotations
        }
      };

      const mergedOptions = {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: {
            ...baseOptions.plugins.legend,
            display: false, // Hide legend for box plot charts
          },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              ...baseOptions.plugins.tooltip.callbacks,
              title: function(context) {
                let date = context[0].parsed.x;
                if (typeof date === 'string') {
                  const dateObj = new Date(date);
                  if (!isNaN(dateObj.getTime())) {
                    if (plot.dataType === 'science') {
                      return toChileLocalTime(dateObj);
                    } else {
                      return toChileLocalDate(dateObj);
                    }
                  }
                  return date.slice(0, 10);
                }
                if (typeof date === 'number') {
                  const dateObj = new Date(date);
                  if (!isNaN(dateObj.getTime())) {
                    if (plot.dataType === 'science') {
                      return toChileLocalTime(dateObj);
                    } else {
                      return toChileLocalDate(dateObj);
                    }
                  }
                }
                return date;
              },
              labelColor: function(context) {
                // Use errorBarColor for box plots (since borderColor is transparent)
                // For regular line charts, use borderColor or backgroundColor
                const color = context.dataset.errorBarColor || context.dataset.borderColor || context.dataset.backgroundColor;
                return {
                  borderColor: color,
                  backgroundColor: color
                };
              },
              label: function(context) {
                // Hide labels for datasets with empty labels (box dataset)
                if (!context.dataset.label || context.dataset.label === '') {
                  return null;
                }
                // Use the base tooltip label callback for whiskers dataset
                const raw = context.raw;
                if (raw && typeof raw === 'object' && raw.min !== undefined) {
                  return [
                    `${context.dataset.label}:`,
                    `min=${raw.min.toFixed(2)}`,
                    `q1=${raw.q1.toFixed(2)}`,
                    `median=${raw.median.toFixed(2)}`,
                    `q3=${raw.q3.toFixed(2)}`,
                    `max=${raw.max.toFixed(2)}`
                  ];
                }
                return context.dataset.label;
              },
              filter: function(tooltipItem) {
                // Hide tooltip items for datasets with empty labels (box dataset)
                return tooltipItem.dataset.label !== '';
              }
            }
          },
          annotation: {
            ...mergedAnnotations,
            interaction: {
              mode: 'nearest',
              intersect: false
            }
          }
        },
        scales: {
          ...baseOptions.scales,
          x: {
            ...baseOptions.scales.x,
            time: {
              ...baseOptions.scales.x.time,
              // Time scale configuration is already set in baseOptions
            },
            title: {
              ...baseOptions.scales.x.title,
              text: (() => {
                const rangeLessThan30Days = isDateRangeLessThan30Days(plot.dateMin, plot.dateMax);
                return rangeLessThan30Days 
                  ? 'Observation Date & Time (Chile Local Time)'
                  : 'Observation Date (Chile Local Time)';
              })()
            },
            ticks: {
              ...baseOptions.scales.x.ticks,
              callback: function(value, index, ticks) {
                // For time scale, value is already a timestamp
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                  const rangeLessThan30Days = isDateRangeLessThan30Days(plot.dateMin, plot.dateMax);
                  if (rangeLessThan30Days) {
                    return date.toLocaleString('en-US', {
                      timeZone: 'America/Santiago',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } else {
                    return date.toLocaleDateString('en-US', {
                      timeZone: 'America/Santiago',
                      month: '2-digit',
                      day: '2-digit'
                    });
                  }
                }
                return value;
              }
            }
          }
        }
      };

      return (
        <Line
          key={chartKey}
          data={{
            datasets: chartData.datasets || []
          }}
          options={mergedOptions}
          width={CHART_DIMENSIONS.LINE_CHART.width}
          height={CHART_DIMENSIONS.LINE_CHART.height}
        />
      );
    } else {
      // Merge inst-log annotations with existing annotations
      // Use the actual raw data for year annotations
      const dataKey = `${plot.dataType}_${plot.parameter}_${plot.dateMin || ''}_${plot.dateMax || ''}_${pipelineVersion}`;
      const rawDataForAnnotations = plotData[dataKey] || [];
      const baseOptions = getLineChartOptions(
        `${getParametersForDataType(plot.dataType, pipelineVersion || 'v1').find(p => p.value === plot.parameter)?.label || plot.parameter} vs DATE-OBS`,
        rawDataForAnnotations,
        plot.dateMin,
        plot.dateMax
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
          legend: {
            ...baseOptions.plugins.legend,
            display: plot.dataType !== 'science' // Hide legend for science
          },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              ...baseOptions.plugins.tooltip.callbacks,
              title: function(context) {
                // For science, show full timestamp in Chile local time; for masterframe, show date only
                let date = context[0].parsed.x;
                if (typeof date === 'number') {
                  date = new Date(date);
                }
                if (date instanceof Date && !isNaN(date)) {
                  if (plot.dataType === 'science') {
                    return toChileLocalTime(date); // Full timestamp in Chile local time for science
                  } else {
                    return toChileLocalDate(date); // Date only in Chile local time for masterframe
                  }
                }
                if (typeof date === 'string') {
                  const dateObj = new Date(date);
                  if (!isNaN(dateObj.getTime())) {
                    if (plot.dataType === 'science') {
                      return toChileLocalTime(dateObj);
                    } else {
                      return toChileLocalDate(dateObj);
                    }
                  }
                  return date.slice(0, 10);
                }
                return date;
              },
              labelColor: function(context) {
                // Use errorBarColor if available (for error bars), otherwise use borderColor or backgroundColor
                const color = context.dataset.errorBarColor || context.dataset.borderColor || context.dataset.backgroundColor;
                return {
                  borderColor: color,
                  backgroundColor: color
                };
              },
              label: function(context) {
                const y = context.parsed.y;
                const std = context.raw?.std;
                const label = context.dataset.label || '';
                if (std !== undefined && std > 0) {
                  return `${label}: ${y.toFixed(3)} ± ${std.toFixed(3)}`;
                }
                return `${label}: ${y.toFixed(3)}`;
              }
            }
          },
          annotation: {
            ...mergedAnnotations,
            interaction: {
              mode: 'nearest',
              intersect: false
            }
          }
        },
        scales: {
          ...baseOptions.scales,
          x: {
            ...baseOptions.scales.x,
            time: {
              ...baseOptions.scales.x.time,
              // Unit is already set in baseOptions based on date range
            },
            title: { 
              display: true, 
              text: (() => {
                const rangeLessThan30Days = isDateRangeLessThan30Days(plot.dateMin, plot.dateMax);
                const baseText = plot.dataType === 'science' 
                  ? 'Observation Date (Chile Local Time)' 
                  : 'Observation Date (Chile Local Time)';
                return rangeLessThan30Days 
                  ? baseText.replace('Date', 'Date & Time')
                  : baseText;
              })()
            },
            ticks: {
              ...baseOptions.scales.x.ticks,
              callback: function(value, index, ticks) {
                const rangeLessThan30Days = isDateRangeLessThan30Days(plot.dateMin, plot.dateMax);
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                  if (rangeLessThan30Days) {
                    return date.toLocaleString('en-US', {
                      timeZone: 'America/Santiago',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } else {
                    return date.toLocaleDateString('en-US', {
                      timeZone: 'America/Santiago',
                      month: '2-digit',
                      day: '2-digit'
                    });
                  }
                }
                return value;
              }
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
    console.error('Error rendering chart:', error);
    return (
      <div className="error-message">
        Error rendering chart: {error.message}
      </div>
    );
  }
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if chart data or plot properties change
  return (
    prevProps.chartData === nextProps.chartData &&
    prevProps.plot.id === nextProps.plot.id &&
    prevProps.plot.dataType === nextProps.plot.dataType &&
    prevProps.plot.parameter === nextProps.plot.parameter &&
    prevProps.plot.chartType === nextProps.plot.chartType &&
    prevProps.plot.dateMin === nextProps.plot.dateMin &&
    prevProps.plot.dateMax === nextProps.plot.dateMax &&
    prevProps.plot.units.join(',') === nextProps.plot.units.join(',') &&
    prevProps.plot.filters.join(',') === nextProps.plot.filters.join(',') &&
    prevProps.plot.objects.join(',') === nextProps.plot.objects.join(',') &&
    prevProps.plot.instLogParts.join(',') === nextProps.plot.instLogParts.join(',') &&
    prevProps.loadingStates === nextProps.loadingStates &&
    prevProps.pipelineVersion === nextProps.pipelineVersion
  );
});

ChartRenderer.displayName = 'ChartRenderer';