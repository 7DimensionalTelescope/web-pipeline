import React, { useEffect, useState, useCallback, useRef } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import axios from "axios";
import { baseurl } from '../config';
import "../styles/PipelineTable.css";
import "../styles/Queue.css";
import CircularProgress from '@mui/material/CircularProgress';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import BugReportIcon from '@mui/icons-material/BugReport';

const Queue = () => {
  const popupRef = useRef(null);
  const [queueData, setQueueData] = useState([]);
  const [error, setError] = useState(null);
  const [sorting, setSorting] = useState([
    { id: "status", desc: true },
    { id: "priority", desc: true }
  ]);
  const [showLoading, setShowLoading] = useState(true);
  const [popupContent, setPopupContent] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    run: { 'daily': true, 'too': true, 'user-input': true },
    group: { 'preprocess': true, 'science': true },
    status: { 'pending': true, 'ready': true, 'processing': true, 'completed': true, 'failed': true}
  });

  // Fetch scheduler data
  const fetchQueueData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setShowLoading(true);
    try {
      const response = await axios.get(baseurl + `/scheduler`);
      // Handle both direct array and object with data property
      const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
      const dataWithIds = data.map((item, index) => ({
        ...item,
        id: item.id || `queue-row-${index}`,
      }));
      setQueueData(dataWithIds);
      setError(null);
    } catch (err) {
      console.error("Error fetching queue data:", err);
      setError("Failed to load queue data");
    } finally {
      if (showSpinner) setShowLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueueData(true);
    // Set up interval for background polling (no spinner)
    const interval = setInterval(() => {
      fetchQueueData(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchQueueData]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupContent(null);
      }
    };

    if (popupContent) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [popupContent]);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && popupContent) setPopupContent(null);
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [popupContent]);

  const handleContentClick = useCallback((row, dtype) => {
    let filePath = '';
    
    if (dtype === 'config') {
      filePath = row.config || row.config_file || 'Config file not available';
    } else if (dtype === 'log') {
      filePath = row.log_file;
      if (!filePath && row.config) {
        // Construct log file path from config path
        filePath = row.config.replace(/\.yml$/, '.log');
      }
      if (!filePath) {
        setPopupContent('Log file not available');
        return;
      }
    } else if (dtype === 'debug') {
      filePath = row.debug_file;
      if (!filePath && row.config) {
        // Construct debug file path from config path: .yml -> _debug.log
        filePath = row.config.replace(/\.yml$/, '_debug.log');
      }
      if (!filePath) {
        setPopupContent('Debug file not available');
        return;
      }
    }
    
    if (filePath === 'Config file not available' || !filePath) {
      setPopupContent(filePath || 'File not available');
      return;
    }
    
    // Fetch file content from backend
    fetch(baseurl + `/text?file_path=${encodeURIComponent(filePath)}`)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(data => {
        if (data.error) {
          console.error('Error:', data.error);
          setPopupContent(data.error);
        } else {
          const content = data.type === 'config' ? JSON.stringify(data.content, null, 2) : data.content;
          setPopupContent(content || 'No content available');
        }
      })
      .catch(error => {
        console.error(`Error fetching ${dtype} file:`, error);
        setPopupContent(`Error loading ${dtype} file`);
      });
  }, []);

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

  // Columns definition
  const columns = React.useMemo(
    () => [
      {
        header: "Config",
        accessorKey: "config",
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) return "N/A";
          // Extract basename from path
          let basename = value.split('/').pop() || value;
          // Remove .yml extension if present
          if (basename.endsWith('.yml')) {
            basename = basename.slice(0, -4);
          }
          return (
            <div className="config-cell">
              {basename}
            </div>
          );
        },
      },
      {
        header: "Run",
        accessorKey: "input_type",
        enableSorting: true,
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) return "N/A";
          // Capitalize first letter
          return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        },
      },
      {
        header: "Group",
        accessorKey: "type",
        enableSorting: true,
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) return "N/A";
          // Capitalize first letter
          return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        },
      },
      {
        header: "Priority",
        accessorKey: "priority",
        enableSorting: true,
      },
      {
        header: "Status",
        accessorKey: "status",
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const statusOrder = {
            'processing': 5,
            'ready': 4,
            'pending': 3,
            'completed': 2,
            'failed': 1
          };
          const statusA = ((rowA.getValue('status') || '').toString()).toLowerCase();
          const statusB = ((rowB.getValue('status') || '').toString()).toLowerCase();
          const orderA = statusOrder[statusA] || 999;
          const orderB = statusOrder[statusB] || 999;
          return orderA - orderB;
        },
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <div
              className="status-badge"
              style={{ '--status-color': getStatusColor(value) }}
            >
              {value || "N/A"}
            </div>
          );
        },
      },
      {
        header: "Elapsed",
        id: "processing_time",
        enableSorting: false,
        cell: ({ row }) => {
          const duration = row.original.duration;
          const processStart = row.original.process_start;
          
          let displayDuration = null;
          
          if (duration !== null && duration !== undefined) {
            displayDuration = duration;
          } else if (processStart) {
            try {
              const startTime = new Date(processStart);
              const now = new Date();
              const diffSeconds = (now - startTime) / 1000;
              if (diffSeconds >= 0) {
                displayDuration = diffSeconds;
              }
            } catch (e) {
              // Invalid date, leave as null
            }
          }
          
          if (displayDuration === null || displayDuration === undefined) {
            return "";
          }
          
          // Format duration nicely
          const seconds = Math.floor(displayDuration);
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;
          
          if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
          } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
          } else {
            return `${displayDuration.toFixed(1)}s`;
          }
        },
      },
      {
        header: "PID",
        id: "pid_state_thread_vmrss",
        accessorKey: "pid",
        enableSorting: true,
        cell: ({ row }) => {
          const pid = row.original.pid;
          const state = row.original.state;
          const threads = row.original.threads;
          const vmrssKb = row.original.vmrss_kb;
          
          let stateStr = state || "";
          let threadsStr = threads !== null && threads !== undefined ? threads.toString() : "";
          let vmrssStr = "";
          
          if (vmrssKb !== null && vmrssKb !== undefined) {
            const mb = vmrssKb / 1024;
            if (mb >= 1024) {
              const gb = mb / 1024;
              vmrssStr = gb.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " GB";
            } else {
              vmrssStr = mb.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " MB";
            }
          }
          
          const parts = [];
          if (stateStr) parts.push(stateStr);
          if (threadsStr) parts.push(threadsStr);
          if (vmrssStr) parts.push(vmrssStr);
          
          const secondLine = parts.length > 0 ? `(${parts.join(" / ")})` : "";
          
          return (
            <div className="pid-cell">
              <div>{pid || ""}</div>
              {secondLine && <div className="pid-second-line">{secondLine}</div>}
            </div>
          );
        },
      },
      {
        header: "Actions",
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="action-buttons">
            <button 
              className="icon-btn" 
              title="Config" 
              onClick={() => handleContentClick(row.original, 'config')}
            >
              <SettingsIcon fontSize="small" />
            </button>
            <button 
              className="icon-btn" 
              title="Log" 
              onClick={() => handleContentClick(row.original, 'log')}
            >
              <DescriptionIcon fontSize="small" />
            </button>
            <button 
              className="icon-btn" 
              title="Debug" 
              onClick={() => handleContentClick(row.original, 'debug')}
            >
              <BugReportIcon fontSize="small" />
            </button>
          </div>
        ),
      },
    ],
    [handleContentClick]
  );


  // Filter data based on selected filters
  const filteredQueueData = React.useMemo(() => {
    return queueData.filter(item => {
      // Filter by run (input_type)
      const run = (item.input_type || '').toLowerCase();
      const runFilters = filters.run;
      if (run === 'daily' && !runFilters['daily']) return false;
      if (run === 'too' && !runFilters['too']) return false;
      if ((run === 'user-input' || run === 'user_input') && !runFilters['user-input']) return false;
      // If run doesn't match any known filter, check if any run filter is enabled
      if (!['daily', 'too', 'user-input', 'user_input'].includes(run)) {
        const hasAnyRunFilter = Object.values(runFilters).some(v => v);
        if (!hasAnyRunFilter) return false;
      }
      
      // Filter by group (type)
      const group = (item.type || '').toLowerCase();
      if (!filters.group[group]) return false;
      
      // Filter by status
      const status = (item.status || '').toLowerCase();
      if (!filters.status[status]) return false;
      
      return true;
    });
  }, [queueData, filters]);

  const table = useReactTable({
    data: filteredQueueData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  // Calculate summary statistics from all data (unfiltered)
  const summary = React.useMemo(() => {
    const total = queueData.length;
    const byStatus = queueData.reduce((acc, item) => {
      const status = item.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const byRun = queueData.reduce((acc, item) => {
      const run = item.input_type || 'Unknown';
      acc[run] = (acc[run] || 0) + 1;
      return acc;
    }, {});
    const byGroup = queueData.reduce((acc, item) => {
      const group = item.type || 'Unknown';
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    }, {});
    
    return { total, byStatus, byRun, byGroup };
  }, [queueData]);

  const handleFilterChange = (category, value) => {
    setFilters(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [value]: !prev[category][value]
      }
    }));
  };


  return (
    <div className="pipeline-container">
      
      {showLoading ? (
        <div className="loading-box">
          <CircularProgress />
          <p>Loading queue data...</p>
        </div>
      ) : error ? (
        <div className="error-box">
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* Summary Box */}
          <div className="summary-box">
            <div className="summary-item">
              <div className="summary-label">Total Items</div>
              <div className="summary-value">{summary.total}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">By Run</div>
              <div className="summary-list">
                {Object.entries(summary.byRun).length > 0 ? (
                  Object.entries(summary.byRun).map(([run, count]) => (
                    <div key={run} className="summary-entry">
                      <span className="summary-entry-label">
                        {run.charAt(0).toUpperCase() + run.slice(1).toLowerCase()}:
                      </span>
                      <span className="summary-entry-value">{count}</span>
                    </div>
                  ))
                ) : (
                  <span className="summary-no-data">No data</span>
                )}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">By Group</div>
              <div className="summary-list">
                {Object.entries(summary.byGroup).length > 0 ? (
                  Object.entries(summary.byGroup).map(([group, count]) => (
                    <div key={group} className="summary-entry">
                      <span className="summary-entry-label">
                        {group.charAt(0).toUpperCase() + group.slice(1).toLowerCase()}:
                      </span>
                      <span className="summary-entry-value">{count}</span>
                    </div>
                  ))
                ) : (
                  <span className="summary-no-data">No data</span>
                )}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">By Status</div>
              <div className="summary-list">
                {Object.entries(summary.byStatus).length > 0 ? (
                  Object.entries(summary.byStatus).map(([status, count]) => (
                    <div key={status} className="summary-entry">
                      <div
                        className="summary-status-badge"
                        style={{ '--status-color': getStatusColor(status) }}
                      >
                        {status}
                      </div>
                      <span className="summary-entry-value">{count}</span>
                    </div>
                  ))
                ) : (
                  <span className="summary-no-data">No data</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Filter Checkboxes */}
          <div className="filter-section">
            {/* Run Filter */}
            <div className="filter-group">
              <div className="filter-group-title">Run</div>
              <div className="filter-options">
                {['daily', 'too', 'user-input'].map(run => (
                  <label 
                    key={run} 
                    className="filter-label"
                  >
                    <input
                      type="checkbox"
                      checked={filters.run[run] || false}
                      onChange={() => handleFilterChange('run', run)}
                      className="filter-checkbox"
                    />
                    <span className="filter-label-text">
                      {run === 'too' ? 'ToO' : run === 'user-input' ? 'User-input' : run.charAt(0).toUpperCase() + run.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Group Filter */}
            <div className="filter-group">
              <div className="filter-group-title">Group</div>
              <div className="filter-options">
                {['preprocess', 'science'].map(group => (
                  <label 
                    key={group} 
                    className="filter-label"
                  >
                    <input
                      type="checkbox"
                      checked={filters.group[group] || false}
                      onChange={() => handleFilterChange('group', group)}
                      className="filter-checkbox"
                    />
                    <span className="filter-label-text">
                      {group.charAt(0).toUpperCase() + group.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div className="filter-group">
              <div className="filter-group-title">Status</div>
              <div className="filter-options">
                {['pending', 'ready', 'processing', 'completed', 'failed'].map(status => (
                  <label 
                    key={status} 
                    className="filter-label"
                  >
                    <input
                      type="checkbox"
                      checked={filters.status[status] || false}
                      onChange={() => handleFilterChange('status', status)}
                      className="filter-checkbox"
                    />
                    <span className="filter-label-text">
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          
          {/* Table */}
          {queueData.length === 0 ? (
            <div className="loading-box">
              <p>No queue data available.</p>
            </div>
          ) : filteredQueueData.length === 0 ? (
            <div className="loading-box">
              <p>No items match the selected filters.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="pipeline-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      className={header.column.getCanSort() ? "sortable-header" : ""}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="sort-icon">
                          {header.column.getIsSorted()
                            ? header.column.getIsSorted() === "desc"
                              ? " ↓"
                              : " ↑"
                            : " ↕"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="pipeline-row">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
      {popupContent && (
        <div className="popup-overlay">
          <div className="popup" ref={popupRef}>
            <div className="popup-header">
              <button className="close-popup" onClick={() => setPopupContent(null)}>
                ✕
              </button>
            </div>
            <div className="popup-content">
              <pre className="log-content">
                {typeof popupContent === 'string' ? popupContent.split('\n').map((line, index) => {
                  if (line.includes('[ERROR]')){
                    return (
                      <span key={index} className="error-line">
                        {line}
                        {index < popupContent.split('\n').length - 1 && '\n'}
                      </span>
                    );
                  } else if (line.includes('[WARNING]')) {
                    return (
                      <span key={index} className="warning-line">
                        {line}
                        {index < popupContent.split('\n').length - 1 && '\n'}
                      </span>
                    );
                  }
                  else {
                    return (
                      <span key={index}>
                        {line}
                        {index < popupContent.split('\n').length - 1 && '\n'}
                      </span>
                    );
                  }
                }) : popupContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Queue;
