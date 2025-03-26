import React, { useState } from 'react';

import PasswordForm from './components/PasswordForm';
import Dashboard from './components/Dashboard';
import PipelineTable from './components/PipelineTable';

import './App.css';

function App() {
    const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);

    const handlePasswordSubmit = () => {
        setIsPasswordFormOpen(false);
    };

    return (
        <div className="app-container">
            {!isPasswordFormOpen && (
                <>
                    <header>
                        <h1>7DT Data Reduction Pipeline</h1>
                    </header>
                    
                    <Dashboard />

                    <PipelineTable />

                    <div style={{ height: "100px" }}></div>
                    
                    <footer className="footer" style={{ position: "fixed", bottom: 0, width: "100%" }}>
                        <div className="footer-content">
                            <p>
                                This pipeline operates using the updated 7DT Pipeline (aka gppy v2.0 {' '}
                                <a href="https://github.com/7DimensionalTelescope/pipeline" target="_blank" rel="noopener noreferrer">GitHub</a>) <br />
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