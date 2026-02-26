import React, { useState, useCallback, useEffect, useRef } from 'react';
import Page from 'components/Page';
import { useApi } from 'hooks/useApi';
import type { Api } from '@jellyfin/sdk';

interface ScriptMetadata {
    name: string;
    description: string;
    isExample?: boolean;
    execute: (api: Api, log: (message: string) => void) => Promise<void> | void;
}

interface Script {
    id: string;
    metadata: ScriptMetadata;
}

interface ConsoleMessage {
    id: string;
    timestamp: string;
    message: string;
}

type ScriptStatus = 'idle' | 'running' | 'success' | 'error';

export const Component = () => {
    const { api, user } = useApi();
    const [scripts, setScripts] = useState<Script[]>([]);
    const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());
    const [scriptStatuses, setScriptStatuses] = useState<Map<string, ScriptStatus>>(new Map());
    const [executionTimes, setExecutionTimes] = useState<Map<string, number>>(new Map());
    const [consoleOutput, setConsoleOutput] = useState<Map<string, ConsoleMessage[]>>(new Map());
    const consoleRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Load all available scripts at mount
    useEffect(() => {
        const loadedScripts: Script[] = [];
        const seenIds = new Set<string>();

        try {
            // Use Webpack's require.context to load scripts at build time
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scriptContext = (require as any).context('../../../../scripts/userScripts', false, /\.(ts|tsx|js|jsx)$/);

            scriptContext.keys().forEach((key: string) => {
                // Normalize the path to get just the filename without extension
                // Handle both './filename.ts' and './path/to/filename.ts' formats
                const fullPath = key.replace('./', '').replace(/\.(ts|tsx|js|jsx)$/, '');
                const scriptId = fullPath.split('/').pop() || fullPath;

                // Skip README and any other non-script files, and skip duplicates
                if (scriptId.toLowerCase().includes('readme') || seenIds.has(scriptId)) {
                    return;
                }

                seenIds.add(scriptId);

                const module = scriptContext(key);

                if (module?.default && typeof module.default === 'object') {
                    const metadata = module.default as ScriptMetadata;

                    // Skip example scripts in production
                    if (process.env.NODE_ENV === 'production' && metadata.isExample) {
                        return;
                    }

                    loadedScripts.push({
                        id: scriptId,
                        metadata
                    });
                }
            });
        } catch (error) {
            console.error('Failed to load scripts:', error);
        }

        setScripts(loadedScripts);
    }, []);

    const log = useCallback((scriptId: string, message: string) => {
        setConsoleOutput(prev => {
            const newMap = new Map(prev);
            const messages = newMap.get(scriptId) || [];
            const timestamp = new Date().toLocaleTimeString();
            // Using timestamp + random for unique ID (not for security purposes)
            // eslint-disable-next-line sonarjs/pseudo-random
            const id = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
            newMap.set(scriptId, [...messages, { id, timestamp, message }]);
            return newMap;
        });

        // Auto-scroll to bottom
        setTimeout(() => {
            const consoleElement = consoleRefs.current.get(scriptId);
            if (consoleElement) {
                consoleElement.scrollTop = consoleElement.scrollHeight;
            }
        }, 10);
    }, []);

    const runScript = useCallback(async (script: Script) => {
        if (!api) {
            console.error('API not available');
            return;
        }

        const scriptId = script.id;
        const startTime = performance.now();

        setRunningScripts(prev => new Set(prev).add(scriptId));
        setScriptStatuses(prev => {
            const newMap = new Map(prev);
            newMap.set(scriptId, 'running');
            return newMap;
        });
        setConsoleOutput(prev => {
            const newMap = new Map(prev);
            newMap.set(scriptId, []);
            return newMap;
        });

        log(scriptId, `Starting script: ${script.metadata.name}`);

        try {
            await script.metadata.execute(api, (message: string) => log(scriptId, message));
            log(scriptId, 'S: Script completed successfully');
            setScriptStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(scriptId, 'success');
                return newMap;
            });
        } catch (error) {
            log(scriptId, `E: Error: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`Script ${scriptId} error:`, error);
            setScriptStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(scriptId, 'error');
                return newMap;
            });
        } finally {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            setExecutionTimes(prev => {
                const newMap = new Map(prev);
                newMap.set(scriptId, duration);
                return newMap;
            });

            setRunningScripts(prev => {
                const newSet = new Set(prev);
                newSet.delete(scriptId);
                return newSet;
            });
        }
    }, [api, log]);

    // Only admins can access scripts
    if (!user?.Policy?.IsAdministrator) {
        return (
            <Page
                id='scriptsPage'
                title='Scripts'
                className='mainAnimatedPage libraryPage userPreferencesPage noSecondaryNavPage'
            >
                <div className='padded-left padded-right padded-bottom-page'>
                    <div className='readOnlyContent'>
                        <p>You must be an administrator to access scripts.</p>
                    </div>
                </div>
            </Page>
        );
    }

    return (
        <Page
            id='scriptsPage'
            title='Scripts'
            className='mainAnimatedPage libraryPage userPreferencesPage noSecondaryNavPage'
            shouldAutoFocus
        >
            <div className='padded-left padded-right padded-bottom-page'>
                <div className='readOnlyContent' style={{ margin: '0 auto' }}>
                    <div className='verticalSection'>
                        <h2 className='sectionTitle'>Scripts</h2>

                        {scripts.length === 0 ? (
                            <div className='paperList'>
                                <p>No scripts available. Create scripts in <code>src/scripts/userScripts/</code> to get started.</p>
                            </div>
                        ) : (
                            scripts.map(script => {
                                const isRunning = runningScripts.has(script.id);
                                const status = scriptStatuses.get(script.id) || 'idle';
                                const executionTime = executionTimes.get(script.id);
                                const output = consoleOutput.get(script.id) || [];

                                return (
                                    <ScriptCard
                                        key={script.id}
                                        script={script}
                                        isRunning={isRunning}
                                        status={status}
                                        executionTime={executionTime}
                                        output={output}
                                        onRun={runScript}
                                        consoleRefs={consoleRefs}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </Page>
    );
};

interface ScriptCardProps {
    script: Script;
    isRunning: boolean;
    status: ScriptStatus;
    executionTime?: number;
    output: ConsoleMessage[];
    onRun: (script: Script) => void;
    consoleRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const ScriptCard: React.FC<ScriptCardProps> = ({ script, isRunning, status, executionTime, output, onRun, consoleRefs }) => {
    const handleRun = useCallback(() => {
        onRun(script);
    }, [onRun, script]);

    const setConsoleRef = useCallback((el: HTMLDivElement | null) => {
        if (el) {
            consoleRefs.current.set(script.id, el);
        }
    }, [consoleRefs, script.id]);

    const getMessageColor = (message: string): string => {
        const prefix = message.substring(0, 2);
        if (prefix === 'S:') return '#4caf50'; // success green
        if (prefix === 'E:') return '#f44336'; // error red
        if (prefix === 'W:') return '#ff9800'; // warning orange
        if (prefix === 'I:') return '#2196f3'; // info blue
        return '#e0e0e0'; // default light gray
    };

    const stripPrefix = (message: string): string => {
        const prefix = message.substring(0, 2);
        if (prefix === 'S:' || prefix === 'E:' || prefix === 'W:' || prefix === 'I:') {
            return message.substring(2).trim();
        }
        return message;
    };

    const getCardStyle = (): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            padding: '1.5em',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            transition: 'background-color 0.3s ease, box-shadow 0.3s ease'
        };

        switch (status) {
            case 'running':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(33, 150, 243, 0.08)',
                    boxShadow: '0 0 12px rgba(33, 150, 243, 0.3)'
                };
            case 'success':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(76, 175, 80, 0.08)',
                    border: '1px solid rgba(76, 175, 80, 0.3)'
                };
            case 'error':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(244, 67, 54, 0.08)',
                    border: '1px solid rgba(244, 67, 54, 0.3)'
                };
            default: // idle
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(0, 0, 0, 0.02)'
                };
        }
    };

    const getButtonStyle = (): React.CSSProperties => {
        switch (status) {
            case 'running':
                return {
                    background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 20px rgba(33, 150, 243, 0.5), 0 0 30px rgba(33, 150, 243, 0.2)'
                };
            case 'success':
                return {
                    background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)'
                };
            case 'error':
                return {
                    background: 'linear-gradient(135deg, #f44336 0%, #c62828 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 15px rgba(244, 67, 54, 0.4)'
                };
            default: // idle
                return {
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)'
                };
        }
    };
    const getButtonIcon = (): string => {
        if (isRunning) return 'autorenew';
        if (status === 'success') return 'check_circle';
        if (status === 'error') return 'error';
        return 'play_arrow';
    };

    const getExecutionTimeColor = (): string => {
        if (status === 'success') return '#4caf50';
        if (status === 'error') return '#f44336';
        return '#999';
    };

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isRunning) {
            e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)';
            const currentShadow = e.currentTarget.style.boxShadow || '';
            e.currentTarget.style.boxShadow = currentShadow.replace(/0 \d+px/, '0 8px');
        }
    }, [isRunning]);

    const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isRunning) {
            e.currentTarget.style.transform = 'scale(1)';
            let baseShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
            if (status === 'running') {
                baseShadow = '0 4px 20px rgba(33, 150, 243, 0.5), 0 0 30px rgba(33, 150, 243, 0.2)';
            } else if (status === 'success') {
                baseShadow = '0 4px 15px rgba(76, 175, 80, 0.4)';
            } else if (status === 'error') {
                baseShadow = '0 4px 15px rgba(244, 67, 54, 0.4)';
            }
            e.currentTarget.style.boxShadow = baseShadow;
        }
    }, [isRunning, status]);
    return (
        <div className='verticalSection verticalSection-extrabottompadding' style={{ marginBottom: '2em' }}>
            <style>
                {`
                    @keyframes pulse {
                        0%, 100% {
                            transform: scale(1);
                            opacity: 1;
                        }
                        50% {
                            transform: scale(1.02);
                            opacity: 0.9;
                        }
                    }
                    
                    @keyframes spin {
                        from {
                            transform: rotate(0deg);
                        }
                        to {
                            transform: rotate(360deg);
                        }
                    }
                    
                    @keyframes shimmer {
                        0% {
                            background-position: -200% center;
                        }
                        100% {
                            background-position: 200% center;
                        }
                    }
                    
                    @keyframes success-pop {
                        0% {
                            transform: scale(1);
                        }
                        50% {
                            transform: scale(1.1);
                        }
                        100% {
                            transform: scale(1);
                        }
                    }
                    
                    @keyframes error-shake {
                        0%, 100% {
                            transform: translateX(0);
                        }
                        25% {
                            transform: translateX(-5px);
                        }
                        75% {
                            transform: translateX(5px);
                        }
                    }
                    
                    .script-run-button {
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .script-run-button::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(
                            90deg,
                            transparent,
                            rgba(255, 255, 255, 0.2),
                            transparent
                        );
                        background-size: 200% 100%;
                        animation: shimmer 2s infinite;
                        opacity: 0;
                        transition: opacity 0.3s;
                    }
                    
                    .script-run-button.running::before {
                        opacity: 1;
                    }
                    
                    .script-run-button.success {
                        animation: success-pop 0.5s ease-out;
                    }
                    
                    .script-run-button.error {
                        animation: error-shake 0.5s ease-out;
                    }
                    
                    .script-run-button .material-icons {
                        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    
                    .script-run-button:hover:not(:disabled) .material-icons {
                        transform: scale(1.2) rotate(15deg);
                    }
                    
                    .script-run-button.running .material-icons {
                        animation: spin 1s linear infinite;
                    }
                    
                    .execution-time {
                        animation: fadeIn 0.3s ease-in;
                    }
                    
                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(-5px);
                        }
                        to {
                            opacity: 0.8;
                            transform: translateY(0);
                        }
                    }
                `}
            </style>
            <div className='paperList' style={getCardStyle()}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1em'
                }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{
                            margin: '0 0 0.5em 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em'
                        }}>
                            <span className='material-icons' style={{ fontSize: '1.2em' }}>code</span>
                            {script.metadata.name}
                        </h3>
                        <p style={{ margin: 0, color: '#999', fontSize: '0.9em' }}>{script.metadata.description}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25em', marginLeft: '1em' }}>
                        <button
                            type='button'
                            onClick={handleRun}
                            disabled={isRunning}
                            className={`script-run-button ${isRunning ? 'running' : status}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5em',
                                padding: '0.75em 1.5em',
                                fontSize: '0.95em',
                                fontWeight: '600',
                                border: 'none',
                                borderRadius: '24px',
                                cursor: isRunning ? 'not-allowed' : 'pointer',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: 'scale(1)',
                                ...getButtonStyle()
                            }}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className='material-icons' style={{ fontSize: '1.2em' }}>
                                {getButtonIcon()}
                            </span>
                            <span>{isRunning ? 'Running' : 'Run Script'}</span>
                        </button>
                        {executionTime !== undefined && !isRunning && (
                            <span className='execution-time' style={{
                                fontSize: '0.75em',
                                color: getExecutionTimeColor(),
                                fontWeight: '600',
                                opacity: 0.8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25em'
                            }}>
                                <span className='material-icons' style={{ fontSize: '1em' }}>schedule</span>
                                {executionTime}ms
                            </span>
                        )}
                    </div>
                </div>

                {output.length > 0 && (
                    <div
                        ref={setConsoleRef}
                        className='paperList'
                        style={{
                            padding: '1em',
                            backgroundColor: '#1a1a1a',
                            color: '#fff',
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                            fontSize: '0.875rem',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '4px',
                            marginTop: '1em',
                            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        {output.map((entry) => (
                            <div key={entry.id} style={{ marginBottom: '0.25em' }}>
                                <span style={{ color: '#888', marginRight: '0.75em' }}>{entry.timestamp}</span>
                                <span style={{ color: getMessageColor(entry.message) }}>
                                    {stripPrefix(entry.message)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

Component.displayName = 'ScriptsPage';
