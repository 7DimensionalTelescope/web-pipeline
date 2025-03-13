import React, { useState } from 'react';

import PasswordForm from './components/PasswordForm';
import Dashboard from './components/Dashboard';

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
                    <footer className="footer">
                        <div className="footer-content">
                            <p>If you have any questions, please contact: 
                                <a href="mailto:myungshin.im@gmail.com?cc=hhchoi1022@gmail.com"> Prof. Myungshin Im</a>
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