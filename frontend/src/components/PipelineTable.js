import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import { format } from "date-fns";
import axios from "axios";
import { baseurl } from '../config';
import "../styles/PipelineTable.css";
import SettingsIcon from '@mui/icons-material/Settings';
import DescriptionIcon from '@mui/icons-material/Description';
import BugReportIcon from '@mui/icons-material/BugReport';
import ImageIcon from '@mui/icons-material/Image';
import CommentIcon from '@mui/icons-material/Comment';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningIcon from '@mui/icons-material/Warning'; // For Warnings
import ErrorIcon from '@mui/icons-material/Error'; // For Errors
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CircularProgress from '@mui/material/CircularProgress';

const PipelineTable = ({ initialDate }) => {
  const popupRef = useRef(null);
  const [pipelineData, setPipelineData] = useState([]); // Science images data
  const [masterframeData, setMasterframeData] = useState([]); // Masterframe images data
  const [error, setError] = useState(null);
  const [masterframeSorting, setMasterframeSorting] = useState([{ id: "unit", desc: false }]);
  const [popupContent, setPopupContent] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newComment, setNewComment] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [showLoading, setShowLoading] = useState(true);
  
  // Update selectedDate when initialDate prop changes
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Fetch science images data
  const fetchPipelineData = useCallback(async (date, showSpinner = false) => {
    if (showSpinner) setShowLoading(true);
    try {
      const response = await axios.get(baseurl+`/pipeline-status?date=${date}`);
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: item.id || `science-row-${index}`,
      }));
      setPipelineData(dataWithIds);
      setError(null);
    } catch (err) {
      console.error("Error fetching pipeline data:", err);
      setError("Failed to load pipeline data");
    } finally {
      if (showSpinner) setShowLoading(false);
    }
  }, [baseurl]);

  // Fetch masterframe images data
  const fetchMasterframeData = useCallback(async (date, showSpinner = false) => {
    if (showSpinner) setShowLoading(true);
    try {
      const response = await axios.get(baseurl+`/masterframe-status?date=${date}`);
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: item.id || `masterframe-row-${index}`,
      }));
      setMasterframeData(dataWithIds);
      setError(null);
    } catch (err) {
      console.error("Error fetching masterframe data:", err);
      setError("Failed to load masterframe data");
    } finally {
      if (showSpinner) setShowLoading(false);
    }
  }, [baseurl]);

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

  // On date change, show spinner and fetch with showSpinner=true
  useEffect(() => {
    setShowLoading(true);
    Promise.all([
      fetchPipelineData(selectedDate, true),
      fetchMasterframeData(selectedDate, true)
    ]).then(() => setShowLoading(false));
    // Set up interval for background polling (no spinner)
    const interval = setInterval(() => {
      fetchPipelineData(selectedDate, false);
      fetchMasterframeData(selectedDate, false);
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedDate, fetchPipelineData, fetchMasterframeData]);

  // Wrap buildQueryString in useCallback
  const buildQueryString = useCallback((row, extraParams = {}) => {
    // Convert run_date from GMT format to YYYY-MM-DD format
    const dateStr = row.run_date ? new Date(row.run_date).toISOString().slice(0, 10) : '';
    
    const baseParams = {
      date: dateStr,
      obj: row.obj,
      unit: row.unit,
      filt: row.filt,
      ...extraParams
    };
    return new URLSearchParams(baseParams).toString();
  }, []);

  const filteredPipelineData = useMemo(() => {
    let filtered = pipelineData;
    if (searchTerm) {
      filtered = filtered.filter(item => item.object?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filtered;
  }, [pipelineData, searchTerm]);

  const filteredMasterframeData = useMemo(() => {
    let filtered = masterframeData;
    if (searchTerm) {
      filtered = filtered.filter(item => item.object?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filtered;
  }, [masterframeData, searchTerm]);

  // Group pipeline data by object
  const groupedPipelineData = useMemo(() => {
    const groups = {};
    filteredPipelineData.forEach(row => {
      if (!groups[row.obj]) groups[row.obj] = [];
      groups[row.obj].push(row);
    });
    return groups;
  }, [filteredPipelineData]);

  const handleContentClick = useCallback((row, dtype, masterframe = false) => {
    // Get file path directly from the data
    let filePath = '';
    
    if (dtype === 'config') {
      filePath = row.config_file || 'Config file not available';
    } else if (dtype === 'log') {
      filePath = row.log_file || 'Log file not available';
    } else if (dtype === 'debug') {
      filePath = row.debug_file || 'Debug file not available';
    } else if (dtype === 'comments') {
      filePath = row.comments_file || 'Comments file not available';
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
        console.error('Error fetching file:', error);
        setPopupContent('Error loading content');
      });
  }, []);

  const handleImageClick = useCallback(async (row, masterframe = false) => {
    try {
      const response = await axios.get(baseurl+`/images?${buildQueryString(row, { masterframe })}`);
      if (!response.data.success) {
        console.error('Error fetching images:', response.data.error);
        setPopupContent(<pre>{response.data.error}</pre>);
        return;
      }
      setPopupContent({
        type: 'images',
        rowData: row,
        content: response.data.images || [],
        names: response.data.names
      });
    } catch (err) {
      console.error('Error fetching images:', err);
      setPopupContent({ type: 'error', content: 'Failed to load images' });
    }
  }, [buildQueryString]);

  const handleMasterframeButtonClick = useCallback(async (row, dtype, target, masterframe = true) => {
    try {
      const queryString = buildQueryString(row, { dtype, target, masterframe });
      const response = await axios.get(baseurl+`/image?${queryString}`, {
        responseType: 'blob'  // Set the responseType to 'blob' to handle image data
      });
      const imageBlob = response.data;
      const imageUrl = URL.createObjectURL(imageBlob);  // Create an object URL for the image
      window.open(imageUrl, '_blank');
    } catch (err) {
      console.error('Error fetching image:', err);
    }
  }, [buildQueryString]);

  const handleSingleImageClick = useCallback(async (filename) => {
    try {
      const response = await axios.get(baseurl+`/image?filename=${filename}`, {
        responseType: 'blob'  // Set the responseType to 'blob' to handle image data
      });
      const imageBlob = response.data;
      const imageUrl = URL.createObjectURL(imageBlob);  // Create an object URL for the image
      window.open(imageUrl, '_blank');
    } catch (err) {
      console.error('Error fetching image:', err);
    }
  }, [baseurl]);

  const handleCommentClick = useCallback(async (row, masterframe = false) => {
    try {
      // Get comments file path directly from the data
      let commentsFilePath = row.comments_file || '';
      
      const response = await axios.get(baseurl + `/comments?file_path=${encodeURIComponent(commentsFilePath)}`);
      setPopupContent({
        type: 'comments',
        rowData: row,
        content: response.data.comments || []
      });
    } catch (err) {
      console.error("Error fetching comments:", err);
      setPopupContent({ type: 'comments', rowData: row, content: [] });
    }
  }, []);

  const handleAddComment = useCallback(
    async (row) => {
      if (!newComment.trim() || !commentAuthor.trim()) return;
  
      try {
        const commentData = {
          comment: newComment,
          author: commentAuthor,
          datetime: new Date().toISOString(),
        };
  
        // Get comments file path directly from the data
        let commentsFilePath = row.comments_file || '';
        
        await axios.post(
          baseurl + `/comments?file_path=${encodeURIComponent(commentsFilePath)}`, 
          commentData
        );
  
        setNewComment("");
        setCommentAuthor("");
  
        handleCommentClick(row, row.masterframe);
      } catch (err) {
        console.error("Error adding comment:", err);
      }
    },
    [newComment, commentAuthor, handleCommentClick]   
  );


  const handleRerun = useCallback(async (row, masterframe = false) => {
    const confirmed = window.confirm("Are you sure to re-run the image(s)?");
    if (confirmed) {
      try {
        await axios.post(baseurl+`/rerun?${buildQueryString(row, { masterframe })}`);
        alert("Rerun request sent successfully!");
        fetchPipelineData(selectedDate);
        fetchMasterframeData(selectedDate);
      } catch (err) {
        console.error("Error sending rerun request:", err);
        alert("Failed to send rerun request: " + err.message);
      }
    }
  }, [selectedDate, fetchPipelineData, fetchMasterframeData, buildQueryString]);
  const masterframeColumns = useMemo(
    () => [
      {
        header: "Date",
        accessorKey: "run_date",
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? format(new Date(value), "yyyy-MM-dd") : "N/A";
        },
        enableSorting: true,
      },
      { header: "Unit", accessorKey: "unit", enableSorting: true },
      {
        header: "Bias",
        accessorKey: "bias",
        enableSorting: false,
        cell: ({ getValue, row }) => {
          const value = getValue();
          if (!value) return null;
          return (
            <div
              style={{
                backgroundColor: "#28A745",
                color: "white",
                textAlign: "center",
                padding: "4px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
              onClick={() => handleMasterframeButtonClick(row.original, "bias", "")}
            >
              Available
            </div>
          );
        },
      },
      {
        header: "Dark",
        accessorKey: "dark",
        enableSorting: false,
        cell: ({ getValue, row }) => {
          const value = getValue();
          let exposures = [];

          if (typeof value === "string") {
            exposures = value.split(",");
          } else if (Array.isArray(value)) {
            exposures = value;
          }

          if (!exposures || exposures.length === 0) {
            return null;
          }
          return (
            <div style={{ display: "flex", justifyContent: "center", gap: "4px" }}>
              {exposures.map((exposure, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: "#28A745",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    textAlign: "center",
                    cursor: "pointer"
                  }}
                  onClick={() => handleMasterframeButtonClick(row.original, "dark", exposure)}
                >
                  {exposure.trim()}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        header: "Flat",
        accessorKey: "flat",
        enableSorting: false,
        cell: ({ getValue, row }) => {
          const value = getValue();
          let filters = [];

          if (typeof value === "string") {
            filters = value.split(",");
          } else if (Array.isArray(value)) {
            filters = value;
          }
          filters = sortFilters(filters);

          if (!filters || filters.length === 0) {
            return null;
          }
          return (
            <div style={{ display: "flex", justifyContent: "center", gap: "4px" }}>
              {filters.map((filter, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: "#28A745",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    textAlign: "center",
                    cursor: "pointer"
                  }}
                  onClick={() => handleMasterframeButtonClick(row.original, "flat", filter)}
                >
                  {filter.trim()}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        header: <WarningIcon fontSize="small" />,
        accessorKey: "warnings",
        cell: ({ getValue, row }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" , cursor: "pointer"}}
              onClick={() => handleContentClick(row.original, "log", true)}
            >
              <WarningIcon fontSize="small" style={{ color: "#FFA500" }} />
              <span style={{ color: "#FFA500", fontWeight: "bold" }}>{value}</span>
            </span>
          ) : null;
        },
        enableSorting: true,
      },
      {
        header: <ErrorIcon fontSize="small" />,
        accessorKey: "errors",
        cell: ({ getValue, row }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
              onClick={() => handleContentClick(row.original, "log", true)}
            >
              <ErrorIcon fontSize="small" style={{ color: "#FF0000" }} />
              <span style={{ color: "#FF0000", fontWeight: "bold" }}>{value}</span>
            </span>
          ) : null;
        },
        enableSorting: true,
      },
      {
        header: <CommentIcon fontSize="small" />,
        accessorKey: "comments",
        cell: ({ getValue, row }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
              onClick={() => handleCommentClick(row.original, true)}
            >
              <CommentIcon fontSize="small" style={{ color: "#1976D2" }} />
              <span style={{ fontWeight: "bold" }}>{value}</span>
            </span>
          ) : null;
        },
        enableSorting: true,
      },
      {
        header: "Actions",
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="action-buttons">
            <button className="icon-btn" title="Config" onClick={() => handleContentClick(row.original, "config", true)}>
              <SettingsIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Log" onClick={() => handleContentClick(row.original, "log", true)}>
              <DescriptionIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Debug" onClick={() => handleContentClick(row.original, "debug", true)}>
              <BugReportIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Images" onClick={() => handleImageClick(row.original, true)}>
              <ImageIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Comments" onClick={() => handleCommentClick(row.original, true)}>
              <CommentIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Rerun" onClick={() => handleRerun(row.original, true)}>
              <RefreshIcon fontSize="small" />
            </button>
          </div>
        ),
      },
    ],
    [handleContentClick, handleImageClick, handleCommentClick, handleRerun, handleMasterframeButtonClick]
  );

  // Only one expanded object at a time (accordion)
  const [expandedObject, setExpandedObject] = useState(null);

  // Utility to sort filters: 'm'-prefix first (asc), then rest (asc)
  function sortFilters(filters) {
    const mFilters = filters.filter(f => /^m/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const otherFilters = filters.filter(f => !/^m/i.test(f)).sort();
    return [...mFilters, ...otherFilters];
  }

  // Utility for progress color
  function getProgressColor(progress, errors) {
    if (errors && errors > 0) return "#FF0000"; // red for error
    if (progress === 0) return "#fffbe6"; // very pale yellow for 0
    if (progress > 0 && progress < 100) return "#FFA500"; // orange for in progress
    if (progress === 100) return "#28A745"; // green for complete
    return "#fffbe6";
  }

  // Prepare grouped data for rendering, with sums
  const scienceGroupRows = useMemo(() => {
    return Object.entries(groupedPipelineData).map(([obj, rows]) => {
      const filters = sortFilters(rows.map(r => r.filt));
      const warnings = rows.reduce((sum, r) => sum + (r.warnings || 0), 0);
      const errors = rows.reduce((sum, r) => sum + (r.errors || 0), 0);
      const comments = rows.reduce((sum, r) => sum + (r.comments || 0), 0);
      return {
        obj,
        filters,
        warnings,
        errors,
        comments,
        rows,
      };
    });
  }, [groupedPipelineData]);

  // Define the filter grid for the mini-table as 10/10/5, last row cells span 2 columns
  const filterGrid = [
    ["m400", "m425", "m450", "m475", "m500", "m525", "m550", "m575", "m600", "m625"],
    ["m650", "m675", "m700", "m725", "m750", "m775", "m800", "m825", "m850", "m875"],
    ["u", "g", "r", "i", "z"]
  ];

  const masterframeTable = useReactTable({
    data: filteredMasterframeData,
    columns: masterframeColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setMasterframeSorting,
    state: { sorting: masterframeSorting },
  });

  return (
    <div className="pipeline-container">
      <div className="header-section">
        <div className="controls">
          <div>
            <h4>Date:</h4>
            <input
              type="date"
              className="date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div>
            <h4>Search:</h4>
            <input
              type="text"
              className="search-input"
              placeholder="Search by object name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>
      {showLoading ? (
        <div className="loading-box">
          <CircularProgress />
          <p>No data available. The observation may not have been made yet, or the data has not been processed.</p>
        </div>
      ) : error ? (
        <div className="error-box">
          <p>{error}</p>
        </div>
      ) : (pipelineData.length === 0 && masterframeData.length === 0) ? (
        <div className="loading-box">
          <p>No data available. The observation may not have been made yet, or the data has not been processed.</p>
        </div>
      ) : (
        <>
          {/* Masterframe Images Table */}
          <div className="table-wrapper">
            <h2 className="pipeline-title">Masterframe Images</h2>
            <table className="pipeline-table">
              <thead>
                {masterframeTable.getHeaderGroups().map((headerGroup) => (
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
                {masterframeTable.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="pipeline-row">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Science Images Table */}
          <div className="table-wrapper">
            <h2 className="pipeline-title">Science Images</h2>
            <table className="pipeline-table science-table">
              <thead>
                <tr className="universal-header">
                  <th className="group-col">Date</th>
                  <th className="group-col">Object</th>
                  <th className="group-col">Filters / Progress</th>
                  <th className="group-col">Warnings</th>
                  <th className="group-col">Errors</th>
                  <th className="group-col">Comments</th>
                  <th className="group-col">Actions</th>
                  <th className="group-col"></th>
                </tr>
              </thead>
              <tbody>
                {scienceGroupRows.map(group => (
                  <React.Fragment key={group.obj}>
                    <tr className={`pipeline-row group-row${expandedObject === group.obj ? ' expanded' : ''}`}
                        onClick={() => setExpandedObject(expandedObject === group.obj ? null : group.obj)}>
                      <td className="group-col">{group.rows[0]?.run_date ? format(new Date(group.rows[0].run_date), "yyyy-MM-dd") : "N/A"}</td>
                      <td className="group-col">{group.obj}</td>
                      <td className="group-col">
                        <table className="filter-mini-table">
                          <tbody>
                            {filterGrid.map((row, rowIdx) => (
                              <tr key={rowIdx}>
                                {rowIdx < 2
                                  ? row.map((filter) => {
                                      const hasFilter = group.filters.includes(filter);
                                      return (
                                        <td
                                          key={filter}
                                          className={hasFilter ? "filter-present" : "filter-absent"}
                                          style={{
                                            fontWeight: 400,
                                            color: hasFilter ? "#222" : "#bbb",
                                            padding: "2px 6px",
                                            fontSize: "0.85em",
                                            background: hasFilter ? getProgressColor(
                                              (group.rows.find(r => r.filt === filter)?.progress) || 0,
                                              (group.rows.find(r => r.filt === filter)?.errors) || 0
                                            ) : undefined
                                          }}
                                        >
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            {filter}
                                          </div>
                                        </td>
                                      );
                                    })
                                  : row.map((filter) => {
                                      const hasFilter = group.filters.includes(filter);
                                      return (
                                        <td
                                          key={filter}
                                          colSpan={2}
                                          className={hasFilter ? "filter-present" : "filter-absent"}
                                          style={{
                                            fontWeight: 400,
                                            color: hasFilter ? "#222" : "#bbb",
                                            padding: "2px 6px",
                                            fontSize: "0.85em",
                                            background: hasFilter ? getProgressColor(
                                              (group.rows.find(r => r.filt === filter)?.progress) || 0,
                                              (group.rows.find(r => r.filt === filter)?.errors) || 0
                                            ) : undefined
                                          }}
                                        >
                                          {filter}
                                        </td>
                                      );
                                    })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                      <td className="group-col">
                        {group.warnings > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <WarningIcon fontSize="small" style={{ color: "#FFA500" }} />
                            <span style={{ color: "#FFA500", fontWeight: "bold" }}>{group.warnings}</span>
                          </span>
                        )}
                      </td>
                      <td className="group-col">
                        {group.errors > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <ErrorIcon fontSize="small" style={{ color: "#FF0000" }} />
                            <span style={{ color: "#FF0000", fontWeight: "bold" }}>{group.errors}</span>
                          </span>
                        )}
                      </td>
                      <td className="group-col">
                        {group.comments > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <CommentIcon fontSize="small" style={{ color: "#1976D2" }} />
                            <span style={{ fontWeight: "bold" }}>{group.comments}</span>
                          </span>
                        )}
                      </td>
                      <td></td>
                      <td className="group-col">
                        {expandedObject === group.obj ? null : (
                          <button className="expand-btn" onClick={e => { e.stopPropagation(); setExpandedObject(expandedObject === group.obj ? null : group.obj); }}>
                            <KeyboardArrowDownIcon />
                          </button>
                        )}
                        {expandedObject === group.obj && (
                          <button className="expand-btn" onClick={e => { e.stopPropagation(); setExpandedObject(null); }}>
                            <KeyboardArrowUpIcon />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedObject === group.obj && [...group.rows].sort((a, b) => a.filt.localeCompare(b.filt, undefined, { numeric: true })).map(row => (
                      <tr key={row.id} className="pipeline-row expanded-row compact-row">
                        <td className="group-col"></td>
                        <td className="group-col"><SubdirectoryArrowRightIcon/></td>
                        <td className="group-col">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 0px', alignItems: 'center', gap: 6 }}>
                            <span>{row.filt}</span>
                            <div style={{ position: 'relative', width: '100%', height: 18, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                              <div style={{
                                width: `${row.progress || 0}%`,
                                height: '100%',
                                background: getProgressColor(row.progress || 0, row.errors || 0),
                                borderRadius: 5,
                                transition: 'width 0.3s, background-color 0.3s'
                              }} />
                              <span style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '0.85em',
                                color: (row.progress === 0 || getProgressColor(row.progress || 0, row.errors || 0) === '#fffbe6') ? '#222' : '#222',
                                fontWeight: 400,
                                whiteSpace: 'nowrap'
                              }}>
                                {((row.status || 'Unknown').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()))}
                              </span>
                            </div>
                            <span></span>
                          </div>
                        </td>
                        <td className="group-col">
                          {row.warnings > 0 ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                              onClick={() => handleContentClick(row, "log", false)}>
                              <WarningIcon fontSize="small" style={{ color: "#FFA500" }} />
                              <span style={{ color: "#FFA500", fontWeight: "bold" }}>{row.warnings}</span>
                            </span>
                          ) : null}
                        </td>
                        <td className="group-col">
                          {row.errors > 0 ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                              onClick={() => handleContentClick(row, "log", false)}>
                              <ErrorIcon fontSize="small" style={{ color: "#FF0000" }} />
                              <span style={{ color: "#FF0000", fontWeight: "bold" }}>{row.errors}</span>
                            </span>
                          ) : null}
                        </td>
                        <td className="group-col">
                          {row.comments > 0 ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                              onClick={() => handleCommentClick(row, false)}>
                              <CommentIcon fontSize="small" style={{ color: "#1976D2" }} />
                              <span style={{ fontWeight: "bold" }}>{row.comments}</span>
                            </span>
                          ) : null}
                        </td>
                        <td className="group-col">
                          <div className="action-buttons">
                            <button className="icon-btn" title="Config" onClick={() => handleContentClick(row, "config", false)}>
                              <SettingsIcon fontSize="small" />
                            </button>
                            <button className="icon-btn" title="Log" onClick={() => handleContentClick(row, "log", false)}>
                              <DescriptionIcon fontSize="small" />
                            </button>
                            <button className="icon-btn" title="Debug" onClick={() => handleContentClick(row, "debug", false)}>
                              <BugReportIcon fontSize="small" />
                            </button>
                            <button className="icon-btn" title="Images" onClick={() => handleImageClick(row, false)}>
                              <ImageIcon fontSize="small" />
                            </button>
                            <button className="icon-btn" title="Comments" onClick={() => handleCommentClick(row, false)}>
                              <CommentIcon fontSize="small" />
                            </button>
                            <button className="icon-btn" title="Rerun" onClick={() => handleRerun(row, false)}>
                              <RefreshIcon fontSize="small" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
              {popupContent.type === 'images' ? (
                <div>
                  <h3>Images</h3>
                  <div className="image-gallery">
                    {Array.isArray(popupContent.content) && popupContent.content.length > 0 ? (
                      popupContent.content.map((imageName, index) => (
                        <div key={index} className="image-item">
                          <h4>{popupContent.names[index]}</h4>
                          <img
                            src={baseurl+`/image?filename=${imageName}`}
                            alt={popupContent.names[index]}
                            width="200"
                            height="200"
                            onClick={() => handleSingleImageClick(imageName)}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="no-images">No Images found</p>
                    )}
                  </div>
                </div>
              ) : popupContent.type === 'comments' ? (
                <>
                  <h3 className="comments-title">Comments</h3>
                  <div className="comments-container">
                    {popupContent.content.length > 0 ? (
                      <div className="comments-list">
                        {popupContent.content.map((comment, index) => (
                          <div key={index} className="comment-card">
                            <div className="comment-header">
                              <span className="comment-author">{comment.author}</span>
                              <span className="comment-datetime">
                                {format(new Date(comment.datetime), "yyyy-MM-dd HH:mm:ss")}
                              </span>
                            </div>
                            <p className="comment-text">{comment.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-comments">No comments yet</p>
                    )}
                    <div className="add-comment-section">
                      <input
                        type="text"
                        value={commentAuthor}
                        onChange={(e) => setCommentAuthor(e.target.value)}
                        placeholder="Your name"
                        className="author-input"
                      />
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="comment-input"
                      />
                      <button
                        onClick={() => handleAddComment(popupContent.rowData)}
                        className="add-comment-btn"
                        disabled={!commentAuthor.trim() || !newComment.trim()}
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <pre className="log-content">
                  {popupContent.split('\n').map((line, index) => {
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
                  })}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineTable;