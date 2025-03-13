import React, { useEffect, useState } from "react";
import axios from "axios";
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:1111/status");
        setData(response.data);
        setError(null);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to connect to server");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const StatusBar = ({ label, value, max = 100, unit = '%', color = '#007BFF' }) => (
    <div className="status-indicator">
      <span className="default-label">{label}</span>
      <div className="status-bar">
        <span className="status-value">{value}{unit}</span>
        <div className="status-bar-track">
          <div 
            className="status-bar-fill" 
            style={{ 
              width: `${Math.min(value, max)}%`, 
              backgroundColor: color 
            }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="container">
      <h1 className="status-text">System Status Monitor</h1>
      <div className="local-time">
        <span className="time-text">Last Updated: {new Date().toLocaleTimeString()}</span>
      </div>

      {error ? (
        <div className="dashboard-box error">
          <p>{error}</p>
        </div>
      ) : !data ? (
        <div className="dashboard-box">
          <p>Loading system data...</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Left Column */}
          <div className="dashboard-column">
            <div className="dashboard-box">
              <h2 className="dashboard-header">CPU</h2>
              <div className="dashboard-content">
                <StatusBar label="Usage" value={data.cpu_percent} color="#007BFF" />
                <StatusBar label="Memory" value={data.memory.percent} color="#007BFF" />
              </div>
            </div>

            <div className="dashboard-box">
              <h2 className="dashboard-header">Storage</h2>
              <div className="dashboard-content">
                <StatusBar 
                  label="Lyman" 
                  value={data.disk.percent}
                  unit={`% (${Math.round(data.disk.free / (1024**4))} / ${Math.round(data.disk.total / (1024**4))} TB)`}
                  color="#28A745"
                />
              </div>
            </div>
          </div>

          {/* Right Column - GPU */}
          <div className="dashboard-column">
            <div className="dashboard-box gpu-box">
              <h2 className="dashboard-header">GPU</h2>
              <div className="dashboard-content">
                {data.gpu && data.gpu.length > 0 ? (
                  data.gpu.map((gpu, index) => {
                    const usagePercent = Math.round((gpu.used / gpu.total) * 100);
                    return (
                      <div key={index} className="gpu-section">
                        <h3 className="bold-label">GPU {index + 1}</h3>
                        <StatusBar 
                          label="Memory" 
                          value={usagePercent}
                          unit={`% (${gpu.used}/${gpu.total}MB)`}
                          color="#6F42C1"
                        />
                        {gpu.utilization !== undefined && (
                          <StatusBar 
                            label="Utilization" 
                            value={gpu.utilization} 
                            color="#6F42C1"
                          />
                        )}
                        {gpu.temperature !== undefined && (
                          <StatusBar 
                            label="Temperature" 
                            value={gpu.temperature} 
                            max={120} 
                            unit="°C"
                            color={gpu.temperature > 80 ? '#DC3545' : '#6F42C1'}
                          />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="no-data">No GPU detected</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;