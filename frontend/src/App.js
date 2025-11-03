import React, { useState } from 'react';

import PasswordForm from './components/PasswordForm';
import Dashboard from './components/Dashboard';
import PipelineTable from './components/PipelineTable';
import Overview from './components/Overview';
import QA from './components/QA';

import './App.css';

function App() {
    const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'pipeline', or 'qa'
    const [selectedDate, setSelectedDate] = useState(null);

    const handlePasswordSubmit = () => {
        setIsPasswordFormOpen(false);
    };

    const handlePlotClick = (date) => {
        // Format date as YYYY-MM-DD
        let dateStr;
        if (date instanceof Date) {
            dateStr = date.toISOString().slice(0, 10);
        } else if (typeof date === 'string') {
            dateStr = date.slice(0, 10);
        } else {
            dateStr = new Date(date).toISOString().slice(0, 10);
        }
        
        setSelectedDate(dateStr);
        setActiveTab('pipeline');
    };

    return (
        <div className="app-container">
            {!isPasswordFormOpen && (
                <>
                    <header>
                        <h1>7DT Reduction Pipeline</h1>
                    </header>
                    
                    
                    <Dashboard />

                    {/* Tab Navigation */}
                    <div className="tab-navigation">
                        <button 
                            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            Overview
                        </button>
                        <button 
                            className={`tab-button ${activeTab === 'pipeline' ? 'active' : ''}`}
                            onClick={() => setActiveTab('pipeline')}
                        >
                            Pipeline
                        </button>
                        <button 
                            className={`tab-button ${activeTab === 'qa' ? 'active' : ''}`}
                            onClick={() => setActiveTab('qa')}
                        >
                            QA
                        </button>
                    </div>
                    
                    {/* Tab Content */}
                    <div className="tab-content">
                        {activeTab === 'overview' && <Overview onPlotClick={handlePlotClick} /> }
                        {activeTab === 'pipeline' && <PipelineTable initialDate={selectedDate} />}
                        {activeTab === 'qa' && <QA />}
                    </div>

                    <div style={{ height: "100px" }}></div>
                    
                    <footer className="footer" style={{ position: "fixed", bottom: 0, width: "100%" }}>
                        <div className="footer-content">
                            <p>
                                This pipeline operates using the updated 7DT Pipeline (aka gppy v2.0 {' '}
                                <a href="https://github.com/7DimensionalTelescope/pipeline" target="_blank" rel="noopener noreferrer">GitHub</a>)
                                and is supported by Web Application v0.5 (see{' '}
                                <a href="https://github.com/7DimensionalTelescope/web-pipeline" target="_blank" rel="noopener noreferrer">GitHub</a>).
                            </p>
                            <p>If you have any questions, please contact: 
                                <a href="mailto:myungshin.im@gmail.com?cc=donggeun.tak@gmail.com"> Prof. Myungshin Im</a>
                            </p>
                        </div>
                    </footer>
                </>
            )}
            <PasswordForm open={isPasswordFormOpen} onPasswordSubmit={handlePasswordSubmit} />
        </div>
    );
}

export default App;