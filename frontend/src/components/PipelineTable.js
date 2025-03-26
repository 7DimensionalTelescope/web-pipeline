import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import { format } from "date-fns";
import axios from "axios";
import "../styles/PipelineTable.css";
import SettingsIcon from '@mui/icons-material/Settings';
import DescriptionIcon from '@mui/icons-material/Description';
import BugReportIcon from '@mui/icons-material/BugReport';
import ImageIcon from '@mui/icons-material/Image';
import CommentIcon from '@mui/icons-material/Comment';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningIcon from '@mui/icons-material/Warning'; // For Warnings
import ErrorIcon from '@mui/icons-material/Error'; // For Errors

const PipelineTable = () => {
  const [pipelineData, setPipelineData] = useState([]); // Science images data
  const [masterframeData, setMasterframeData] = useState([]); // Masterframe images data
  const [error, setError] = useState(null);
  const [sorting, setSorting] = useState([{ id: "errors", desc: true }]);
  const [masterframeSorting, setMasterframeSorting] = useState([{ id: "errors", desc: true }]);
  const [popupContent, setPopupContent] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newComment, setNewComment] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [selectedUnits, setSelectedUnits] = useState(
    Array.from({ length: 20 }, (_, i) => `7DT${String(i + 1).padStart(2, '0')}`).reduce((acc, unit) => ({ ...acc, [unit]: true }), {})
  ); // All units checked by default
  
  const units = Array.from({ length: 20 }, (_, i) => `7DT${String(i + 1).padStart(2, '0')}`); // 7DT01 to 7DT20
  const unitLabels = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')); // 01 to 20 for display

  // Fetch science images data
  const fetchPipelineData = useCallback(async (date) => {
    try {
      const response = await axios.get(`/pipeline/api/pipeline-status?date=${date}`);
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: item.id || `science-row-${index}`,
      }));
      setPipelineData(dataWithIds);
      setError(null);
    } catch (err) {
      console.error("Error fetching pipeline data:", err);
      setError("Failed to load pipeline data");
    }
  }, []);

  // Fetch masterframe images data
  const fetchMasterframeData = useCallback(async (date) => {
    try {
      const response = await axios.get(`/pipeline/api/masterframe-status?date=${date}`);
      const dataWithIds = response.data.map((item, index) => ({
        ...item,
        id: item.id || `masterframe-row-${index}`,
      }));
      setMasterframeData(dataWithIds);
      setError(null);
    } catch (err) {
      console.error("Error fetching masterframe data:", err);
      setError("Failed to load masterframe data");
    }
  }, []);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && popupContent) setPopupContent(null);
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [popupContent]);

  useEffect(() => {
    fetchPipelineData(selectedDate);
    fetchMasterframeData(selectedDate);
    const interval = setInterval(() => {
      fetchPipelineData(selectedDate);
      fetchMasterframeData(selectedDate);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedDate, fetchPipelineData, fetchMasterframeData]);

  const buildQueryString = (row, extraParams = {}) => {
    const baseParams = {
      date: row.date,
      obj: row.object,
      unit: row.unit,
      filt: row.filter,
      n_binning: row.n_binning,
      gain: row.gain,
      ...extraParams
    };
    return new URLSearchParams(baseParams).toString();
  };

  const filteredPipelineData = useMemo(() => {
    let filtered = pipelineData;
    if (searchTerm) {
      filtered = filtered.filter(item => item.object?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filtered.filter(item => selectedUnits[item.unit]);
  }, [pipelineData, searchTerm, selectedUnits]);

  const filteredMasterframeData = useMemo(() => {
    let filtered = masterframeData;
    if (searchTerm) {
      filtered = filtered.filter(item => item.object?.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filtered.filter(item => selectedUnits[item.unit]);
  }, [masterframeData, searchTerm, selectedUnits]);

  const handleUnitChange = (unit) => {
    setSelectedUnits(prev => ({ ...prev, [unit]: !prev[unit] }));
  };

  // Action handlers (shared for both tables where applicable)
  const handleContentClick = useCallback((row, dtype, masterframe = false) => {
    const queryString = buildQueryString(row, { dtype, masterframe });
    fetch(`/pipeline/api/text?${queryString}`)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(data => {
        if (data.error) {
          console.error('Error:', data.error);
          setPopupContent(<pre>{data.error}</pre>);
        } else {
          setPopupContent(
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto', maxWidth: '100%' }}>
              {data.type === 'config' ? JSON.stringify(data.content, null, 2) : data.content}
            </pre>
          );
        }
      })
      .catch(error => {
        console.error('Error fetching file:', error);
        setPopupContent(<pre>Error loading content</pre>);
      });
  }, []);

  const handleImageClick = useCallback(async (row, masterframe = false) => {
    try {
      const response = await axios.get(`/pipeline/api/images?${buildQueryString(row, { masterframe })}`);
      if (!response.data.success) {
        console.error('Error fetching images:', response.data.error);
        setPopupContent(<pre>{response.data.error}</pre>);
        return;
      }
      setPopupContent({
        type: 'images',
        rowData: row,
        content: response.data.images,
        names: response.data.names
      });
    } catch (err) {
      console.error('Error fetching images:', err);
      setPopupContent({ type: 'error', content: 'Failed to load images' });
    }
  }, []);

  const handleCommentClick = useCallback(async (row, masterframe = false) => {
    try {
      const response = await axios.get(`/pipeline/api/comments?${buildQueryString(row, { masterframe })}`);
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
  
        const queryString = buildQueryString(row, { masterframe: !!row.masterframe });
  
        await axios.post(
          `/pipeline/api/comments?${queryString}`, 
          commentData
        );
  
        setNewComment("");
        setCommentAuthor("");
  
        handleCommentClick(row, row.masterframe);
      } catch (err) {
        console.error("Error adding comment:", err);
      }
    },
    [newComment, commentAuthor, buildQueryString, handleCommentClick]   
  );


  const handleRerun = useCallback(async (row, masterframe = false) => {
    const confirmed = window.confirm("Are you sure to re-run the image(s)?");
    if (confirmed) {
      try {
        await axios.post(`/pipeline/api/rerun?${buildQueryString(row, { masterframe })}`);
        alert("Rerun request sent successfully!");
        fetchPipelineData(selectedDate);
        fetchMasterframeData(selectedDate);
      } catch (err) {
        console.error("Error sending rerun request:", err);
        alert("Failed to send rerun request: " + err.message);
      }
    }
  }, [selectedDate, fetchPipelineData, fetchMasterframeData]);

  // Columns definition (shared for both tables)
  const columns = useMemo(
    () => [
      {
        header: "Date",
        accessorKey: "date",
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? format(new Date(value), "yyyy-MM-dd") : "N/A";
        },
        enableSorting: true,
      },
      { header: "Unit", accessorKey: "unit", enableSorting: true },
      { header: "Object", accessorKey: "object", enableSorting: true },
      { header: "Filter", accessorKey: "filter", enableSorting: true },
      { header: "Gain", accessorKey: "gain", enableSorting: false },
      { header: "Bin", accessorKey: "n_binning", enableSorting: false },
      {
        header: "Progress",
        accessorKey: "progress",
        cell: ({ getValue, row }) => {
          const value = getValue() || 0;
          const status = row.original.status || "Unknown";
          const getBarColor = (val) => (val < 100 ? "#FFA500" : "#28A745");
          return (
            <div className="custom-progress-bar">
              <div className="custom-progress-fill" style={{ width: `${value}%`, backgroundColor: getBarColor(value) }} />
              <span className="custom-progress-label">{status}</span>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        header: <WarningIcon fontSize="small" />,
        accessorKey: "warnings",
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
            <button className="icon-btn" title="Config" onClick={() => handleContentClick(row.original, "config", false)}>
              <SettingsIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Log" onClick={() => handleContentClick(row.original, "log", false)}>
              <DescriptionIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Debug" onClick={() => handleContentClick(row.original, "debug", false)}>
              <BugReportIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Images" onClick={() => handleImageClick(row.original, false)}>
              <ImageIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Comments" onClick={() => handleCommentClick(row.original, false)}>
              <CommentIcon fontSize="small" />
            </button>
            <button className="icon-btn" title="Rerun" onClick={() => handleRerun(row.original, false)}>
              <RefreshIcon fontSize="small" />
            </button>
          </div>
        ),
      },
    ],
    [handleContentClick, handleImageClick, handleCommentClick, handleRerun]
  );
  
  const masterframeColumns = useMemo(
    () => [
      {
        header: "Date",
        accessorKey: "date",
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? format(new Date(value), "yyyy-MM-dd") : "N/A";
        },
        enableSorting: true,
      },
      { header: "Unit", accessorKey: "unit", enableSorting: true },
      { header: "Gain", accessorKey: "gain", enableSorting: true },
      { header: "Bin", accessorKey: "n_binning", enableSorting: false },
      {
        header: "Bias",
        accessorKey: "bias",
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <div
              style={{
                backgroundColor: value ? "#28A745" : "transparent",
                color: value ? "white" : "black",
                textAlign: "center",
                padding: "4px",
                borderRadius: "4px",
              }}
            >
              {value ? "Nominal" : "N/A"}
            </div>
          );
        },
      },
      {
        header: "Dark",
        accessorKey: "dark",
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <div
              style={{
                backgroundColor: value ? "#28A745" : "transparent",
                color: value ? "white" : "black",
                textAlign: "center",
                padding: "4px",
                borderRadius: "4px",
              }}
            >
              {value ? "Exist" : "N/A"}
            </div>
          );
        },
      },
      {
        header: "Flat",
        accessorKey: "flat",
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          let filters = [];

          if (typeof value === "string") {
            filters = value.split(",");
          } else if (Array.isArray(value)) {
            filters = value;
          }

          if (!filters || filters.length === 0) {
            return <div style={{ textAlign: "center" }}>N/A</div>;
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
                  }}
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
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
        cell: ({ getValue }) => {
          const value = getValue() || 0;
          return value > 0 ? (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
    [handleContentClick, handleImageClick, handleCommentClick, handleRerun]
  );

  const scienceTable = useReactTable({
    data: filteredPipelineData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

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
        <h2>Pipeline Status</h2>
        <div className="controls">
          <h4>Date:</h4>
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <h4>Search:</h4>
          <input
            type="text"
            className="search-input"
            placeholder="Search by object name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <h4>Units:</h4>
          <div className="unit-checkboxes">
            {units.map((unit, index) => (
              <label key={unit} className="unit-checkbox">
                <input
                  type="checkbox"
                  checked={selectedUnits[unit]}
                  onChange={() => handleUnitChange(unit)}
                />
                {unitLabels[index]}
              </label>
            ))}
          </div>
        </div>
      </div>
      {error ? (
        <div className="error-box">
          <p>{error}</p>
        </div>
      ) : (pipelineData.length === 0 && masterframeData.length === 0) ? (
        <div className="loading-box">
          <p>Loading pipeline data...</p>
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
            <table className="pipeline-table">
              <thead>
                {scienceTable.getHeaderGroups().map((headerGroup) => (
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
                {scienceTable.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="pipeline-row">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {popupContent && (
        <div className="popup-overlay">
          <div className="popup">
            <div className="popup-content">
              {popupContent.type === 'images' ? (
                <div>
                  <h3>Images</h3>
                  <div className="image-gallery">
                    {popupContent.content.length > 0 ? (
                      popupContent.content.map((imageName, index) => (
                        <div key={index} className="image-item">
                          <h4>{popupContent.names[index]}</h4>
                          <img
                            src={`/pipeline/api/image?filename=${imageName}`}
                            alt={popupContent.names[index]}
                            width="200"
                            height="200"
                            onClick={() => window.open(`/pipeline/api/image?filename=${imageName}`, '_blank')}
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
                <pre>{popupContent}</pre>
              )}
              <button className="close-popup" onClick={() => setPopupContent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineTable;