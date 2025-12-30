import React, { useEffect, useState } from "react";
import axios from "axios";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { baseurl } from '../config';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(baseurl+"/status");
        setData(response.data);
        setError(null);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to connect to server");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
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
              '--progress-width': `${(value / max) * 100}%`,
              '--progress-color': color
            }}
          />
        </div>
      </div>
    </div>
  );

  const CoreUsageGrid = ({ cores }) => {
    const getColor = (usage) => {
      if (usage < 50) return '#8BC34A'; 
      if (usage < 70) return '#FFE100'; 
      if (usage < 90) return '#FFA500';
      return '#DC3545'; 
    };

    return (
      <div className="core-usage-grid">
        {cores.map((usage, index) => {
          let usageLevel = 'low';
          if (usage >= 90) usageLevel = 'critical';
          else if (usage >= 70) usageLevel = 'high';
          else if (usage >= 50) usageLevel = 'medium';
          
          return (
            <div
              key={index}
              className="core-block"
              data-usage-level={usageLevel}
              title={`Core ${index + 1}: ${usage}%`}
            />
          );
        })}
      </div>
    );
  };

  const getStatusColor = (section) => {
    if (!data) return '#6C757D';
    switch (section) {
      case 'cpu':
        const cpuUsage = data.cpu.percent;
        if (cpuUsage < 50) return '#28A745';
        if (cpuUsage < 70) return '#FFA500';
        if (cpuUsage < 90) return '#DC3545';
        return '#000000';
      case 'gpu':
        if (!data.gpu || data.gpu.info.length === 0) return '#28A745';
        const gpuUsage = Math.max(...data.gpu.info.map(g => Math.round((g.used / g.total) * 100)));
        if (gpuUsage < 50) return '#28A745';
        if (gpuUsage < 70) return '#FFA500';
        if (gpuUsage < 90) return '#DC3545';
        return '#000000';
      case 'storage':
        if (!data.disk || data.disk.partitions.length === 0) return '#28A745';
        const diskUsage = Math.max(...data.disk.partitions.map(d => d.percent));
        if (diskUsage < 70) return '#28A745';
        if (diskUsage < 80) return '#FFA500';
        if (diskUsage < 90) return '#DC3545';
        return '#000000';
      case 'io':
          const ioRead = Math.round(data.io.read_speed);
          const ioWrite = Math.round(data.io.write_speed);
          const ioMax = Math.max(ioRead, ioWrite);
          if (ioMax < 30) return '#000000';
          if (ioMax < 50) return '#DC3545';
          if (ioMax < 100) return '#FFA500';
          return '#28A745';
      case 'network':
        const netDown = Math.round(data.network.download_speed/1000);
        const netUp = Math.round(data.network.upload_speed/1000);
        const netMax = Math.max(netDown, netUp);
        if (netMax < 1) return '#000000';
        if (netMax < 2) return '#DC3545';
        if (netMax < 3) return '#FFA500';
        return '#28A745';
      default:
        return '#6C757D';
    }
  };

  return (
    <div className="container">
      <h1 className="status-text">System Status Monitor</h1>
      <div className="local-time">
        <span className="time-text">Last Updated: {new Date().toLocaleTimeString()}</span>
      </div>
      <div 
        className="collapse-toggle local-time" 
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="collapse-text">{isCollapsed ? 'Expand' : 'Collapse'}</span>
        {isCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
      </div>

      {error ? (
        <div className="dashboard-box error">
          <p>{error}</p>
        </div>
      ) : !data ? (
        <div className="dashboard-box loading">
          <p>Loading system data...</p>
        </div>
      ) : isCollapsed ? (
        <div className="collapsed-view">
          <div className="status-item">
            <div 
              className="status-circle" 
              data-status-section="cpu"
              data-status-level={(() => {
                const cpuUsage = data.cpu.percent;
                if (cpuUsage < 50) return 'good';
                if (cpuUsage < 70) return 'warning';
                if (cpuUsage < 90) return 'critical';
                return 'danger';
              })()}
            ></div>
            <span className="status-label">CPU ({data.cpu.percent}%)</span>
          </div>
          <div className="status-item">
            <div 
              className="status-circle" 
              data-status-section="gpu"
              data-status-level={(() => {
                if (!data.gpu || data.gpu.info.length === 0) return 'good';
                const gpuUsage = Math.max(...data.gpu.info.map(g => Math.round((g.used / g.total) * 100)));
                if (gpuUsage < 50) return 'good';
                if (gpuUsage < 70) return 'warning';
                if (gpuUsage < 90) return 'critical';
                return 'danger';
              })()}
            ></div>
            <span className="status-label">GPU ({Math.max(...data.gpu.info.map(g => Math.round((g.used / g.total) * 100)))}%)</span>
          </div>
          <div className="status-item">
            <div 
              className="status-circle" 
              data-status-section="storage"
              data-status-level={(() => {
                if (!data.disk || data.disk.partitions.length === 0) return 'good';
                const diskUsage = Math.max(...data.disk.partitions.map(d => d.percent));
                if (diskUsage < 70) return 'good';
                if (diskUsage < 80) return 'warning';
                if (diskUsage < 90) return 'critical';
                return 'danger';
              })()}
            ></div>
            <span className="status-label">Storage ({Math.max(...data.disk.partitions.map(d => d.percent))}%)</span>
          </div>
          <div className="status-item">
            <div 
              className="status-circle" 
              data-status-section="io"
              data-status-level={(() => {
                const ioRead = Math.round(data.io.read_speed);
                const ioWrite = Math.round(data.io.write_speed);
                const ioMax = Math.max(ioRead, ioWrite);
                if (ioMax < 30) return 'none';
                if (ioMax < 50) return 'critical';
                if (ioMax < 100) return 'warning';
                return 'good';
              })()}
            ></div>
            <span className="status-label">Disk I/O ({data.io.read_speed} / {data.io.write_speed} Mbps)</span>
          </div>
          <div className="status-item">
            <div 
              className="status-circle" 
              data-status-section="network"
              data-status-level={(() => {
                const netDown = Math.round(data.network.download_speed/1000);
                const netUp = Math.round(data.network.upload_speed/1000);
                const netMax = Math.max(netDown, netUp);
                if (netMax < 1) return 'none';
                if (netMax < 2) return 'critical';
                if (netMax < 3) return 'warning';
                return 'good';
              })()}
            ></div>
            <span className="status-label">Network ({Math.round(data.network.download_speed/100) / 10} / {Math.round(data.network.upload_speed/100) / 10} Gbps)</span>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="dashboard-column">
            <div className="dashboard-box">
              <h2 className="dashboard-header">CPU</h2>
              <div className="dashboard-content">
                <StatusBar label="Usage" value={data.cpu.percent} color="#007BFF" />
                <StatusBar label="Memory" value={data.memory.percent} color="#007BFF" />
                {data.cpu.cores && (
                  <div className="core-usage-container">
                    <span className="default-label">Core Usage:</span>
                    <CoreUsageGrid cores={data.cpu.cores} />
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-box">
              <h2 className="dashboard-header">GPU</h2>
              <div className="dashboard-content">
                {data.gpu && data.gpu.info.length > 0 ? (
                  data.gpu.info.map((gpu, index) => {
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
                      </div>
                    );
                  })
                ) : (
                  <p className="no-data">No GPU detected</p>
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-column">
            <div className="dashboard-box">
              <h2 className="dashboard-header">Storage</h2>
              <div className="dashboard-content">
                {data.disk && data.disk.partitions.length > 0 ? (
                  data.disk.partitions.map((disk, index) => (
                    <div key={index} className="disk-section">
                      <h4 className="bold-label">{disk.name}</h4>
                      <StatusBar 
                        label="Disk" 
                        value={disk.percent}
                        unit={`% (${Math.round(disk.used / (1024**4))} / ${Math.round(disk.total / (1024**4))} TB)`}
                        color="#6F42C1"
                      />
                    </div>
                  ))
                ) : (
                  <p className="no-data">No disk detected</p>
                )}
              </div>
            </div>

            <div className="dashboard-box">
              <h2 className="dashboard-header">Disk I/O</h2>
              <div className="dashboard-content">
                <StatusBar 
                  label="Read" 
                  value={data.io.read_speed} 
                  unit=" Mbps" 
                  color="#FFA500" 
                  max={1000}
                />
                <StatusBar 
                  label="Write" 
                  value={data.io.write_speed} 
                  unit=" Mbps" 
                  color="#FFA500" 
                  max={1000}
                />
              </div>
            </div>

            <div className="dashboard-box">
              <h2 className="dashboard-header">Network</h2>
              <div className="dashboard-content">
                <StatusBar 
                  label="Download" 
                  value={Math.round(data.network.download_speed)} 
                  unit=" Mbps" 
                  color="#FFA500" 
                  max={10000}
                />
                <StatusBar 
                  label="Upload" 
                  value={Math.round(data.network.upload_speed)} 
                  unit=" Mbps" 
                  color="#FFA500" 
                  max={10000}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;