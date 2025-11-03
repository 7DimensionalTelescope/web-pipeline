// Shared plotting utilities for consistent chart rendering across components
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, BarElement } from 'chart.js';
import { LineWithErrorBarsChart, LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';
import { ScatterController } from 'chart.js';
import { TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

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

// Year change annotations function copied exactly from _overview.js
export const getYearChangeAnnotations = (plotData, plotType = null) => {
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
  
  // Note: Cutoff lines are now generated from API config in the QA component
  // They are no longer hardcoded here
  
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

// Common Chart.js options for line charts - copied structure from _overview.js
export const getLineChartOptions = (title, plotData, plotType, onPlotClick, customYAxis = null) => ({
  responsive: false,
  maintainAspectRatio: false,
  onClick: onPlotClick,
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
    title: { display: true, text: title },
    annotation: getYearChangeAnnotations(plotData, plotType),
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
        unit: 'day',
        displayFormats: { day: 'MM-dd' }
      },
      title: { display: true, text: 'Observation Date (UTC)' },
      ticks: { maxRotation: 90, minRotation: 45, autoSkip: true, maxTicksLimit: 50 },
    },
    y: customYAxis || { 
      title: { 
        display: true, 
        text: title.split(' vs ')[0] // Extract parameter name from title
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
});

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