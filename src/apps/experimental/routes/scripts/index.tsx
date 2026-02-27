import React, { useState, useCallback, useEffect, useRef } from 'react';
import Page from 'components/Page';
import { useApi } from 'hooks/useApi';
import type { ScriptContext } from 'scripts/types/ScriptContext';

interface ScriptMetadata {
    name: string;
    description: string;
    isExample?: boolean;
    execute: (context: ScriptContext) => Promise<void> | void;
}

interface Script {
    id: string;
    metadata: ScriptMetadata;
}

interface ConsoleMessage {
    id: string;
    timestamp: string;
    message: string;
    type?: 'log';
}

interface PendingInput {
    scriptId: string;
    prompt: string;
    type: 'input' | 'confirm' | 'select';
    options?: Record<string, string>; // For select type
    resolve: (value: string | boolean) => void;
}

interface ProgressState {
    scriptId: string;
    message: string;
    percent: number;
}

type ScriptStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped' | 'waiting';

interface ConsoleSettings {
    showTimestamp: boolean;
    wordWrap: boolean;
    coloredOutput: boolean;
}

export const Component = () => {
    const { api, user } = useApi();
    const [scripts, setScripts] = useState<Script[]>([]);
    const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());
    const [scriptStatuses, setScriptStatuses] = useState<Map<string, ScriptStatus>>(new Map());
    const [executionTimes, setExecutionTimes] = useState<Map<string, number>>(new Map());
    const [consoleOutput, setConsoleOutput] = useState<Map<string, ConsoleMessage[]>>(new Map());
    const [consoleSettings, setConsoleSettings] = useState<Map<string, ConsoleSettings>>(
        new Map()
    );
    const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
    const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [progressState, setProgressState] = useState<ProgressState | null>(null);
    const consoleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scriptStatusOverrides = useRef<Map<string, 'skip' | 'fail'>>(new Map());

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
            newMap.set(scriptId, [...messages, { id, timestamp, message, type: 'log' }]);
            return newMap;
        });

        // Smooth auto-scroll to bottom
        setTimeout(() => {
            const consoleElement = consoleRefs.current.get(scriptId);
            if (consoleElement) {
                consoleElement.scrollTo({
                    top: consoleElement.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 10);
    }, []);

    const handleUserInput = useCallback((scriptId: string, prompt: string, type: 'input' | 'confirm' | 'select', options?: Record<string, string>): Promise<string | boolean> => {
        return new Promise((resolve) => {
            // Log the prompt as a normal console message
            log(scriptId, prompt);

            // Set waiting status
            setScriptStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(scriptId, 'waiting');
                return newMap;
            });

            setPendingInput({
                scriptId,
                prompt,
                type,
                options,
                resolve: resolve as (value: string | boolean) => void
            });
        });
    }, [log]);

    const submitInput = useCallback((value?: string) => {
        if (!pendingInput) return;

        const { scriptId, type, resolve } = pendingInput;
        const finalValue = value !== undefined ? value : inputValue;

        if (type === 'input' || type === 'select') {
            log(scriptId, `${finalValue || '(empty)'}`);
            resolve(finalValue);
        } else {
            // For confirm
            const confirmed = finalValue.toLowerCase() === 'yes';
            log(scriptId, `${confirmed ? 'Yes' : 'No'}`);
            resolve(confirmed);
        }

        // Reset waiting status back to running
        setScriptStatuses(prev => {
            const newMap = new Map(prev);
            newMap.set(scriptId, 'running');
            return newMap;
        });

        setPendingInput(null);
        setInputValue('');
    }, [pendingInput, inputValue, log]);

    const cancelInput = useCallback(() => {
        if (!pendingInput) return;

        const { scriptId, type, resolve } = pendingInput;

        log(scriptId, 'W: User cancelled input');

        // Reject with empty/false
        resolve(type === 'input' ? '' : false);

        // Reset back to running
        setScriptStatuses(prev => {
            const newMap = new Map(prev);
            newMap.set(scriptId, 'running');
            return newMap;
        });

        setPendingInput(null);
        setInputValue('');
    }, [pendingInput, log]);

    const runScript = useCallback(async (script: Script) => {
        if (!api) {
            console.error('API not available');
            return;
        }

        const scriptId = script.id;

        // Prevent running if already running or waiting for input
        if (runningScripts.has(scriptId)) {
            log(scriptId, 'W: Script is already running');
            return;
        }

        // Prevent running if another script is waiting for input
        if (pendingInput && pendingInput.scriptId !== scriptId) {
            log(scriptId, 'W: Another script is waiting for input');
            return;
        }

        const startTime = performance.now();
        scriptStatusOverrides.current.delete(scriptId);

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

        // Create context object
        const context: ScriptContext = {
            api,
            log: (message: string) => log(scriptId, message),
            input: (prompt: string) => handleUserInput(scriptId, prompt, 'input') as Promise<string>,
            confirm: (question: string) => handleUserInput(scriptId, question, 'confirm') as Promise<boolean>,
            select: (prompt: string, options: Record<string, string>) => handleUserInput(scriptId, prompt, 'select', options) as Promise<string>,
            progress: (message: string, percent: number) => {
                setProgressState({
                    scriptId,
                    message,
                    percent: Math.min(100, Math.max(0, percent))
                });
            },
            skip: (reason?: string) => {
                scriptStatusOverrides.current.set(scriptId, 'skip');
                if (reason) {
                    log(scriptId, `I: Skipped: ${reason}`);
                }
            },
            fail: (reason?: string) => {
                scriptStatusOverrides.current.set(scriptId, 'fail');
                if (reason) {
                    log(scriptId, `E: Failed: ${reason}`);
                }
            }
        };

        try {
            await script.metadata.execute(context);

            // Check for status overrides
            const override = scriptStatusOverrides.current.get(scriptId);

            if (override === 'skip') {
                log(scriptId, 'I: Script skipped');
                setScriptStatuses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(scriptId, 'skipped');
                    return newMap;
                });
            } else if (override === 'fail') {
                log(scriptId, 'E: Script failed');
                setScriptStatuses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(scriptId, 'error');
                    return newMap;
                });
            } else {
                log(scriptId, 'S: Script completed successfully');
                setScriptStatuses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(scriptId, 'success');
                    return newMap;
                });
            }
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

            // Clean up pending input if this script had one
            setPendingInput(prev => {
                if (prev?.scriptId === scriptId) {
                    return null;
                }
                return prev;
            });
            setInputValue('');

            // Clean up progress if this script had one
            setProgressState(prev => {
                if (prev?.scriptId === scriptId) {
                    return null;
                }
                return prev;
            });

            scriptStatusOverrides.current.delete(scriptId);
        }
    }, [api, log, handleUserInput, runningScripts, pendingInput]);

    const getConsoleSettings = useCallback((scriptId: string): ConsoleSettings => {
        return consoleSettings.get(scriptId) || { showTimestamp: true, wordWrap: true, coloredOutput: true };
    }, [consoleSettings]);

    const toggleTimestamp = useCallback((scriptId: string) => {
        setConsoleSettings(prev => {
            const newMap = new Map(prev);
            const current = prev.get(scriptId) || { showTimestamp: true, wordWrap: true, coloredOutput: true };
            newMap.set(scriptId, { ...current, showTimestamp: !current.showTimestamp });
            return newMap;
        });
    }, []);

    const toggleWordWrap = useCallback((scriptId: string) => {
        setConsoleSettings(prev => {
            const newMap = new Map(prev);
            const current = prev.get(scriptId) || { showTimestamp: true, wordWrap: true, coloredOutput: true };
            newMap.set(scriptId, { ...current, wordWrap: !current.wordWrap });
            return newMap;
        });
    }, []);

    const toggleColoredOutput = useCallback((scriptId: string) => {
        setConsoleSettings(prev => {
            const newMap = new Map(prev);
            const current = prev.get(scriptId) || { showTimestamp: true, wordWrap: true, coloredOutput: true };
            newMap.set(scriptId, { ...current, coloredOutput: !current.coloredOutput });
            return newMap;
        });
    }, []);

    const copyConsoleOutput = useCallback((scriptId: string) => {
        const output = consoleOutput.get(scriptId) || [];
        const settings = getConsoleSettings(scriptId);

        const text = output.map(entry => {
            const prefix = settings.showTimestamp ? `${entry.timestamp} ` : '';
            // Strip color prefixes
            const prefixRegex = /^[SEWI]:$/;
            const hasPrefix = prefixRegex.exec(entry.message.substring(0, 2));
            const message = hasPrefix ? entry.message.substring(2).trim() : entry.message;
            return `${prefix}${message}`;
        }).join('\n');

        navigator.clipboard.writeText(text).then(() => {
            setCopiedScriptId(scriptId);
            setTimeout(() => setCopiedScriptId(null), 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }, [consoleOutput, getConsoleSettings]);

    const clearConsole = useCallback((scriptId: string) => {
        setConsoleOutput(prev => {
            const newMap = new Map(prev);
            newMap.delete(scriptId);
            return newMap;
        });
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setInputValue(e.target.value);
    }, []);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') submitInput();
        if (e.key === 'Escape') cancelInput();
    }, [submitInput, cancelInput]);

    const handleConfirmYes = useCallback(() => {
        submitInput('yes');
    }, [submitInput]);

    const handleConfirmNo = useCallback(() => {
        submitInput('no');
    }, [submitInput]);

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
                <div className='readOnlyContent' style={{ maxWidth: '1400px', margin: '0 auto' }}>
                    <div className='verticalSection'>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '1.5em',
                            flexWrap: 'wrap',
                            gap: '1em',
                            userSelect: 'none'
                        }}>
                            <h2 className='sectionTitle' style={{ margin: 0, cursor: 'default' }}>User Scripts</h2>
                            <div style={{
                                fontSize: '0.9em',
                                color: '#999',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5em',
                                cursor: 'default'
                            }}>
                                <span className='material-icons' style={{ fontSize: '1.2em' }}>terminal</span>
                                <span>{scripts.length} script{scripts.length !== 1 ? 's' : ''} available</span>
                            </div>
                        </div>

                        {scripts.length === 0 ? (
                            <div className='paperList' style={{
                                padding: '3em 2em',
                                textAlign: 'center',
                                backgroundColor: 'rgba(0, 0, 0, 0.02)',
                                borderRadius: '12px',
                                border: '2px dashed rgba(255, 255, 255, 0.1)'
                            }}>
                                <span className='material-icons' style={{
                                    fontSize: '4em',
                                    color: 'rgba(255, 255, 255, 0.1)',
                                    marginBottom: '0.5em'
                                }}>code_off</span>
                                <h3 style={{ margin: '0.5em 0', color: '#999' }}>No Scripts Available</h3>
                                <p style={{ margin: '0.5em 0', color: '#666' }}>
                                    Create scripts in <code style={{
                                        padding: '0.2em 0.5em',
                                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                        borderRadius: '4px'
                                    }}>src/scripts/userScripts/</code> to get started
                                </p>
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.5em',
                                maxWidth: '900px',
                                width: '100%',
                                margin: '0 auto',
                                minWidth: 0
                            }}>
                                {scripts.map(script => {
                                    const scriptId = script.id;
                                    const isRunning = runningScripts.has(scriptId);
                                    const status = scriptStatuses.get(scriptId) || 'idle';
                                    const executionTime = executionTimes.get(scriptId);
                                    const output = consoleOutput.get(scriptId) || [];
                                    const settings = getConsoleSettings(scriptId);
                                    const isCopied = copiedScriptId === scriptId;

                                    return (
                                        <ScriptCard
                                            key={scriptId}
                                            script={script}
                                            isRunning={isRunning}
                                            status={status}
                                            executionTime={executionTime}
                                            output={output}
                                            settings={settings}
                                            isCopied={isCopied}
                                            onRun={runScript}
                                            onToggleTimestamp={toggleTimestamp}
                                            onToggleWordWrap={toggleWordWrap}
                                            onToggleColoredOutput={toggleColoredOutput}
                                            onCopy={copyConsoleOutput}
                                            onClear={clearConsole}
                                            consoleRefs={consoleRefs}
                                            pendingInput={pendingInput}
                                            progressState={progressState}
                                            inputValue={inputValue}
                                            onInputChange={handleInputChange}
                                            onInputKeyDown={handleInputKeyDown}
                                            onSubmit={submitInput}
                                            onCancel={cancelInput}
                                            onConfirmYes={handleConfirmYes}
                                            onConfirmNo={handleConfirmNo}
                                        />
                                    );
                                })}
                            </div>
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
    status:ScriptStatus;
    executionTime?: number;
    output: ConsoleMessage[];
    settings: ConsoleSettings;
    isCopied: boolean;
    onRun: (script: Script) => void;
    onToggleTimestamp: (scriptId: string) => void;
    onToggleWordWrap: (scriptId: string) => void;
    onToggleColoredOutput: (scriptId: string) => void;
    onCopy: (scriptId: string) => void;
    onClear: (scriptId: string) => void;
    consoleRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
    pendingInput: PendingInput | null;
    progressState: ProgressState | null;
    inputValue: string;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onSubmit: (value?: string) => void;
    onCancel: () => void;
    onConfirmYes: () => void;
    onConfirmNo: () => void;
}

const ScriptCard: React.FC<ScriptCardProps> = ({
    script,
    isRunning,
    status,
    executionTime,
    output,
    settings,
    isCopied,
    onRun,
    onToggleTimestamp,
    onToggleWordWrap,
    onToggleColoredOutput,
    onCopy,
    onClear,
    consoleRefs,
    pendingInput,
    progressState,
    inputValue,
    onInputChange,
    onInputKeyDown,
    onSubmit,
    onCancel,
    onConfirmYes,
    onConfirmNo
}) => {
    const handleRun = useCallback(() => {
        onRun(script);
    }, [onRun, script]);

    const handleToggleTimestamp = useCallback(() => {
        onToggleTimestamp(script.id);
    }, [onToggleTimestamp, script.id]);

    const handleToggleWordWrap = useCallback(() => {
        onToggleWordWrap(script.id);
    }, [onToggleWordWrap, script.id]);

    const handleToggleColoredOutput = useCallback(() => {
        onToggleColoredOutput(script.id);
    }, [onToggleColoredOutput, script.id]);

    const handleCopy = useCallback(() => {
        onCopy(script.id);
    }, [onCopy, script.id]);

    const handleClear = useCallback(() => {
        onClear(script.id);
    }, [onClear, script.id]);

    const setConsoleRef = useCallback((el: HTMLDivElement | null) => {
        if (el) {
            consoleRefs.current.set(script.id, el);
        }
    }, [consoleRefs, script.id]);

    const getMessageDisplay = (message: string): { color: string; text: string } => {
        const prefix = message.substring(0, 2);
        let color = '#e0e0e0';
        let text = message;

        if (prefix === 'S:') {
            color = '#4caf50';
            text = message.substring(2).trim();
        } else if (prefix === 'E:') {
            color = '#f44336';
            text = message.substring(2).trim();
        } else if (prefix === 'W:') {
            color = '#ff9800';
            text = message.substring(2).trim();
        } else if (prefix === 'I:') {
            color = '#2196f3';
            text = message.substring(2).trim();
        }

        return { color, text };
    };

    const formatExecutionTime = (ms: number): string => {
        if (ms >= 10000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms}ms`;
    };

    const getCardStyle = (): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            padding: '1.5em',
            borderRadius: '12px',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
        };

        switch (status) {
            case 'running':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(33, 150, 243, 0.12)',
                    borderColor: 'rgba(33, 150, 243, 0.4)',
                    boxShadow: '0 4px 20px rgba(33, 150, 243, 0.3)'
                };
            case 'waiting':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(255, 193, 7, 0.12)',
                    borderColor: 'rgba(255, 193, 7, 0.5)',
                    boxShadow: '0 0 25px rgba(255, 193, 7, 0.4)'
                };
            case 'success':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(76, 175, 80, 0.12)',
                    borderColor: 'rgba(76, 175, 80, 0.4)',
                    boxShadow: '0 2px 12px rgba(76, 175, 80, 0.2)'
                };
            case 'error':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(244, 67, 54, 0.12)',
                    borderColor: 'rgba(244, 67, 54, 0.4)',
                    boxShadow: '0 2px 12px rgba(244, 67, 54, 0.2)'
                };
            case 'skipped':
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(158, 158, 158, 0.08)',
                    borderColor: 'rgba(158, 158, 158, 0.3)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                };
            default: // idle
                return {
                    ...baseStyle,
                    backgroundColor: 'rgba(0, 0, 0, 0.02)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
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
            case 'waiting':
                return {
                    background: 'linear-gradient(135deg, #ffc107 0%, #ffa000 100%)',
                    color: '#000',
                    boxShadow: '0 4px 20px rgba(255, 193, 7, 0.6), 0 0 35px rgba(255, 193, 7, 0.3)'
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
            case 'skipped':
                return {
                    background: 'linear-gradient(135deg, #9e9e9e 0%, #757575 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 10px rgba(158, 158, 158, 0.3)'
                };
            default: // idle
                return {
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)'
                };
        }
    };
    const getCardIcon = (): string => {
        if (status === 'running') return 'pending';
        if (status === 'waiting') return 'hourglass_empty';
        return 'code';
    };

    const getButtonIcon = (): string => {
        if (status === 'waiting') return 'hourglass_empty';
        if (isRunning) return 'autorenew';
        if (status === 'success') return 'check_circle';
        if (status === 'error') return 'error';
        if (status === 'skipped') return 'block';
        return 'play_arrow';
    };

    const getButtonClass = (): string => {
        if (status === 'waiting') return 'waiting';
        if (isRunning) return 'running';
        return status;
    };

    const getButtonText = (): string => {
        if (status === 'waiting') return 'Waiting...';
        if (isRunning) return 'Running...';
        return 'Run';
    };

    const getExecutionTimeColor = (): string => {
        if (status === 'success') return '#4caf50';
        if (status === 'error') return '#f44336';
        if (status === 'skipped') return '#9e9e9e';
        return '#999';
    };

    const getIconColor = (): string => {
        if (status === 'success') return '#4caf50';
        if (status === 'error') return '#f44336';
        if (status === 'running') return '#2196f3';
        if (status === 'waiting') return '#ffc107';
        if (status === 'skipped') return '#9e9e9e';
        return '#6366f1';
    };

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isRunning && status !== 'waiting') {
            e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)';
            const currentShadow = e.currentTarget.style.boxShadow || '';
            e.currentTarget.style.boxShadow = currentShadow.replace(/0 \d+px/, '0 8px');
        }
    }, [isRunning, status]);

    const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (!isRunning && status !== 'waiting') {
            e.currentTarget.style.transform = 'scale(1)';
            let baseShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
            if (status === 'success') {
                baseShadow = '0 4px 15px rgba(76, 175, 80, 0.4)';
            } else if (status === 'error') {
                baseShadow = '0 4px 15px rgba(244, 67, 54, 0.4)';
            }
            e.currentTarget.style.boxShadow = baseShadow;
        }
    }, [isRunning, status]);
    return (
        <div style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
            <style>
                {`
                    @keyframes pulse-glow {
                        0%, 100% { box-shadow: 0 0 20px rgba(33, 150, 243, 0.4); }
                        50% { box-shadow: 0 0 30px rgba(33, 150, 243, 0.6); }
                    }
                    
                    @keyframes waiting-pulse {
                        0%, 100% { 
                            box-shadow: 0 0 25px rgba(255, 193, 7, 0.4), 0 0 60px rgba(255, 193, 7, 0.2);
                            border-color: rgba(255, 193, 7, 0.5);
                        }
                        50% { 
                            box-shadow: 0 0 40px rgba(255, 193, 7, 0.7), 0 0 80px rgba(255, 193, 7, 0.4);
                            border-color: rgba(255, 193, 7, 0.8);
                        }
                    }
                    
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    
                    @keyframes shimmer {
                        0% { background-position: -200% center; }
                        100% { background-position: 200% center; }
                    }
                    
                    @keyframes success-pop {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                        100% { transform: scale(1); }
                    }
                    
                    @keyframes error-shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-8px); }
                        75% { transform: translateX(8px); }
                    }
                    
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    
                    @keyframes copied-checkmark {
                        0% { transform: scale(0); opacity: 0; }
                        50% { transform: scale(1.2); opacity: 1; }
                        100% { transform: scale(1); opacity: 1; }
                    }

                    .script-card {
                        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .script-card.running {
                        animation: pulse-glow 2s ease-in-out infinite;
                    }
                    
                    .script-card.waiting {
                        animation: waiting-pulse 1.5s ease-in-out infinite;
                    }
                    
                    .script-card.success {
                        animation: success-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    
                    .script-card.error {
                        animation: error-shake 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    .script-run-button {
                        position: relative;
                        overflow: hidden;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    .script-run-button::before {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
                        background-size: 200% 100%;
                        animation: shimmer 2s infinite;
                        opacity: 0;
                        transition: opacity 0.3s;
                    }
                    
                    .script-run-button.running::before {
                        opacity: 1;
                    }
                    
                    .script-run-button .material-icons {
                        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    
                    .script-run-button:hover:not(:disabled) .material-icons {
                        transform: scale(1.15);
                    }
                    
                    .script-run-button.running .material-icons,
                    .script-run-button.waiting .material-icons {
                        animation: spin 1.2s linear infinite;
                    }
                    
                    .console-toolbar {
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    @media (max-width: 640px) {
                        .console-title {
                            display: none !important;
                        }
                        
                        .console-toolbar {
                            justify-content: center !important;
                        }
                        
                        .console-buttons {
                            justify-content: center;
                        }
                        
                        .run-button-text {
                            display: none !important;
                        }
                        
                        .script-card-icon {
                            display: none !important;
                        }
                    }
                    
                    .console-toolbar-button {
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        opacity: 0.85;
                        position: relative;
                    }
                    
                    .console-toolbar-button:hover {
                        opacity: 1;
                        transform: scale(1.05);
                    }
                    
                    .console-toolbar-button.active {
                        opacity: 1;
                        background: rgba(99, 102, 241, 0.25) !important;
                    }
                    
                    .console-toolbar-button[data-tooltip]:hover::after {
                        content: attr(data-tooltip);
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%) translateY(-8px);
                        padding: 6px 10px;
                        background: rgba(50, 50, 50, 0.95);
                        color: #fff;
                        font-size: 12px;
                        font-weight: 500;
                        white-space: nowrap;
                        border-radius: 6px;
                        pointer-events: none;
                        z-index: 1000;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        animation: tooltipFade 0.15s ease-out;
                    }
                    
                    .console-toolbar-button[data-tooltip]:hover::before {
                        content: '';
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%) translateY(-2px);
                        border: 5px solid transparent;
                        border-top-color: rgba(50, 50, 50, 0.95);
                        pointer-events: none;
                        z-index: 1001;
                        animation: tooltipFade 0.15s ease-out;
                    }
                    
                    /* Hide browser default tooltips */
                    .console-toolbar-button[data-tooltip] {
                        position: relative;
                    }
                    
                    @keyframes tooltipFade {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    
                    .copied-indicator {
                        animation: copied-checkmark 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }

                    .console-output {
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.2);
                        scroll-behavior: smooth;
                        user-select: text;
                    }
                    
                    .console-line {
                        animation: fadeIn 0.3s ease-out;
                    }
                    
                    .console-output::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                    }
                    
                    .console-output::-webkit-scrollbar-track {
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 4px;
                    }
                    
                    .console-output::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.3);
                        border-radius: 4px;
                    }
                    
                    .console-output::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.5);
                    }
                `}
            </style>
            <div className={`script-card paperList ${status}`} style={{
                ...getCardStyle(),
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden'
            }}>
                {/* Header Section */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1em',
                    marginBottom: output.length > 0 ? '1.25em' : '0'
                }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <h3 style={{
                            margin: '0 0 0.5em 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                            fontSize: '1.1em',
                            fontWeight: '600',
                            userSelect: 'none',
                            cursor: 'default'
                        }}>
                            <span className='material-icons script-card-icon' style={{
                                fontSize: '1.3em',
                                color: getIconColor()
                            }}>
                                {getCardIcon()}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {script.metadata.name}
                            </span>
                        </h3>
                        <p style={{
                            margin: 0,
                            color: '#999',
                            fontSize: '0.875em',
                            lineHeight: '1.5',
                            userSelect: 'none',
                            cursor: 'default',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word'
                        }}>
                            {script.metadata.description}
                        </p>
                    </div>

                    {/* Run Button Section - Fixed Height to Prevent Teleporting */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '0.5em',
                        minHeight: '70px',
                        justifyContent: 'flex-start'
                    }}>
                        <button
                            type='button'
                            onClick={handleRun}
                            disabled={isRunning || status === 'waiting'}
                            className={`script-run-button ${getButtonClass()}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5em',
                                padding: '0.7em 1.25em',
                                fontSize: '0.95em',
                                fontWeight: '600',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: (isRunning || status === 'waiting') ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                                userSelect: 'none',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                ...getButtonStyle()
                            }}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className='material-icons' style={{ fontSize: '1.1em', lineHeight: 1 }}>
                                {getButtonIcon()}
                            </span>
                            <span className='run-button-text' style={{ lineHeight: 1 }}>{getButtonText()}</span>
                        </button>

                        {/* Execution Time - Always Takes Space */}
                        <div style={{
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%'
                        }}>
                            {executionTime !== undefined && !isRunning && status !== 'waiting' && (
                                <span style={{
                                    fontSize: '0.75em',
                                    color: getExecutionTimeColor(),
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25em',
                                    animation: 'slideIn 0.3s ease-out',
                                    userSelect: 'none',
                                    cursor: 'default'
                                }}>
                                    <span className='material-icons' style={{ fontSize: '1em' }}>schedule</span>
                                    {formatExecutionTime(executionTime)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Console Output Section */}
                {output.length > 0 && (
                    <div style={{
                        marginTop: 'auto',
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: '6px',
                        overflow: 'visible',
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                        position: 'relative',
                        zIndex: 1
                    }}>
                        {/* Console Toolbar */}
                        <div className='console-toolbar' style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.6em 1em',
                            background: 'linear-gradient(180deg, #1a1a1a 0%, #141414 100%)',
                            borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
                            gap: '0.5em',
                            flexWrap: 'wrap',
                            userSelect: 'none',
                            width: '100%',
                            boxSizing: 'border-box',
                            overflow: 'visible',
                            position: 'relative',
                            zIndex: 2,
                            borderRadius: '6px 6px 0 0'
                        }}>
                            <div className='console-title' style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4em',
                                fontSize: '0.75em',
                                color: '#999',
                                fontWeight: '600',
                                cursor: 'default',
                                textTransform: 'uppercase',
                                letterSpacing: '0.8px'
                            }}>
                                <span className='material-icons' style={{ fontSize: '1.3em', color: '#aaa' }}>terminal</span>
                                <span style={{ color: '#aaa' }}>Console</span>
                                <span style={{ color: '#666' }}>·</span>
                                <span style={{ color: '#999' }}>{output.length}</span>
                            </div>

                            <div className='console-buttons' style={{ display: 'flex', gap: '0.35em' }}>
                                <button
                                    type='button'
                                    onClick={handleCopy}
                                    className={`console-toolbar-button ${isCopied ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0.45em',
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8em',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: isCopied ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                                        color: isCopied ? '#4caf50' : '#ddd',
                                        transition: 'all 0.2s',
                                        userSelect: 'none',
                                        flexShrink: 0
                                    }}
                                    data-tooltip={isCopied ? 'Copied!' : 'Copy output'}
                                    aria-label='Copy output'
                                >
                                    <span className={`material-icons ${isCopied ? 'copied-indicator' : ''}`} style={{ fontSize: '1.2em' }}>
                                        {isCopied ? 'check' : 'content_copy'}
                                    </span>
                                </button>

                                <button
                                    type='button'
                                    onClick={handleClear}
                                    className='console-toolbar-button'
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0.45em',
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8em',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#ddd',
                                        flexShrink: 0
                                    }}
                                    data-tooltip='Clear console'
                                    aria-label='Clear console'
                                >
                                    <span className='material-icons' style={{ fontSize: '1.2em' }}>
                                        delete_sweep
                                    </span>
                                </button>

                                <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 0.25em' }} />

                                <button
                                    type='button'
                                    onClick={handleToggleTimestamp}
                                    className={`console-toolbar-button ${settings.showTimestamp ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0.45em',
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8em',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#ddd',
                                        flexShrink: 0
                                    }}
                                    data-tooltip={settings.showTimestamp ? 'Hide timestamps' : 'Show timestamps'}
                                    aria-label={settings.showTimestamp ? 'Hide timestamps' : 'Show timestamps'}
                                >
                                    <span className='material-icons' style={{ fontSize: '1.2em' }}>
                                        schedule
                                    </span>
                                </button>

                                <button
                                    type='button'
                                    onClick={handleToggleWordWrap}
                                    className={`console-toolbar-button ${settings.wordWrap ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0.45em',
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8em',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#ddd',
                                        flexShrink: 0
                                    }}
                                    data-tooltip={settings.wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                                    aria-label={settings.wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                                >
                                    <span className='material-icons' style={{ fontSize: '1.2em' }}>wrap_text</span>
                                </button>

                                <button
                                    type='button'
                                    onClick={handleToggleColoredOutput}
                                    className={`console-toolbar-button ${settings.coloredOutput ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0.45em',
                                        width: '32px',
                                        height: '32px',
                                        fontSize: '0.8em',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#ddd',
                                        flexShrink: 0
                                    }}
                                    data-tooltip={settings.coloredOutput ? 'Disable colors' : 'Enable colors'}
                                    aria-label={settings.coloredOutput ? 'Disable colors' : 'Enable colors'}
                                >
                                    <span className='material-icons' style={{ fontSize: '1.2em' }}>palette</span>
                                </button>
                            </div>
                        </div>

                        {/* Console Output */}
                        <div
                            ref={setConsoleRef}
                            className='console-output'
                            style={{
                                padding: '1em 1.25em',
                                backgroundColor: '#1a1a1a',
                                color: '#fff',
                                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                fontSize: '0.85em',
                                maxHeight: '400px',
                                minHeight: '150px',
                                overflowY: 'auto',
                                overflowX: 'auto',
                                whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre',
                                wordBreak: settings.wordWrap ? 'break-word' : 'normal',
                                borderTop: '1px solid rgba(99, 102, 241, 0.1)',
                                lineHeight: '1.6',
                                width: '100%',
                                boxSizing: 'border-box',
                                borderRadius: (pendingInput?.scriptId === script.id || progressState?.scriptId === script.id) ? '0' : '0 0 6px 6px'
                            }}
                        >
                            {output.map((entry) => {
                                return (
                                    <div key={entry.id} className='console-line' style={{
                                        marginBottom: '0.4em'
                                    }}>
                                        {settings.showTimestamp && (
                                            <span style={{
                                                color: '#666',
                                                marginRight: '0.75em',
                                                fontSize: '0.9em',
                                                userSelect: 'none'
                                            }}>
                                                {entry.timestamp}
                                            </span>
                                        )}

                                        {/* Message display */}
                                        {(() => {
                                            const msgDisplay = settings.coloredOutput ? getMessageDisplay(entry.message) : { color: '#e0e0e0', text: entry.message };
                                            return (
                                                <span style={{
                                                    color: msgDisplay.color
                                                }}>
                                                    {msgDisplay.text}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Console Footer - Shows when this script is waiting for input or showing progress */}
                        {(pendingInput?.scriptId === script.id || progressState?.scriptId === script.id) && (
                            <ConsoleFooter
                                pendingInput={pendingInput?.scriptId === script.id ? pendingInput : null}
                                progressState={progressState?.scriptId === script.id ? progressState : null}
                                inputValue={inputValue}
                                onInputChange={onInputChange}
                                onInputKeyDown={onInputKeyDown}
                                onSubmit={onSubmit}
                                onCancel={onCancel}
                                onConfirmYes={onConfirmYes}
                                onConfirmNo={onConfirmNo}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface ConsoleFooterProps {
    pendingInput: PendingInput | null;
    progressState: ProgressState | null;
    inputValue: string;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onSubmit: (value?: string) => void;
    onCancel: () => void;
    onConfirmYes: () => void;
    onConfirmNo: () => void;
}

const ConsoleFooter: React.FC<ConsoleFooterProps> = ({
    pendingInput,
    progressState,
    inputValue,
    onInputChange,
    onInputKeyDown,
    onSubmit,
    onCancel,
    onConfirmYes,
    onConfirmNo
}) => {
    // Input handlers
    const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
    }, []);

    const handleInputBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }, []);

    const handleSelectFocus = useCallback((e: React.FocusEvent<HTMLSelectElement>) => {
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
    }, []);

    const handleSelectBlur = useCallback((e: React.FocusEvent<HTMLSelectElement>) => {
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }, []);

    // Select button hover handlers
    const handleSelectCancelEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    }, []);

    const handleSelectCancelLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }, []);

    const handleSelectSubmitEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
    }, []);

    const handleSelectSubmitLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
    }, []);

    // Button hover handlers
    const handleCancelEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    }, []);

    const handleCancelLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }, []);

    const handleSubmitEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
    }, []);

    const handleSubmitLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
    }, []);

    const handleConfirmNoEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    }, []);

    const handleConfirmNoLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }, []);

    const handleConfirmYesEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
    }, []);

    const handleConfirmYesLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
    }, []);

    const handleSubmitClick = useCallback(() => {
        onSubmit();
    }, [onSubmit]);

    return (
        <div style={{
            backgroundColor: '#1a1a1a',
            borderTop: '1px solid rgba(99, 102, 241, 0.15)',
            borderRadius: '0 0 6px 6px',
            animation: 'slideDownFooter 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect: 'none',
            overflow: 'hidden'
        }}>
            <style>
                {`
                    @keyframes slideDownFooter {
                        from { 
                            opacity: 0; 
                            max-height: 0;
                            transform: scaleY(0);
                            transform-origin: top;
                        }
                        to { 
                            opacity: 1; 
                            max-height: 100px;
                            transform: scaleY(1);
                        }
                    }
                `}
            </style>

            {/* Progress Bar */}
            {progressState && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1em',
                    padding: '0.75em 1em',
                    borderBottom: pendingInput ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                }}>
                    <div style={{
                        flex: '0 0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5em',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '0.9em',
                        minWidth: '150px',
                        userSelect: 'none',
                        cursor: 'default'
                    }}>
                        <span className='material-icons' style={{ fontSize: '1.2em', color: '#6366f1', userSelect: 'none' }}>
                            hourglass_empty
                        </span>
                        <span style={{ userSelect: 'none' }}>{progressState.message}</span>
                    </div>

                    <div style={{
                        flex: '1 1 auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75em'
                    }}>
                        <div style={{
                            flex: 1,
                            height: '8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${progressState.percent}%`,
                                background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                                borderRadius: '4px',
                                transition: 'width 0.3s ease-out',
                                boxShadow: '0 0 10px rgba(99, 102, 241, 0.5)'
                            }} />
                        </div>

                        <span style={{
                            color: '#6366f1',
                            fontWeight: '700',
                            fontSize: '0.9em',
                            minWidth: '45px',
                            textAlign: 'right',
                            userSelect: 'none',
                            cursor: 'default'
                        }}>
                            {Math.round(progressState.percent)}%
                        </span>
                    </div>
                </div>
            )}

            {/* Input Footer */}
            {pendingInput && (
                <>
                    {/* Input Type */}
                    {pendingInput.type === 'input' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75em',
                            padding: '0.75em 1em'
                        }}>
                            <input
                                type='text'
                                value={inputValue}
                                onChange={onInputChange}
                                onKeyDown={onInputKeyDown}
                                placeholder={pendingInput.prompt}
                                style={{
                                    flex: 1,
                                    padding: '0 0.85em',
                                    fontSize: '0.9em',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                    minWidth: 0,
                                    height: '36px'
                                }}
                                onFocus={handleInputFocus}
                                onBlur={handleInputBlur}
                            />

                            <button
                                type='button'
                                onClick={onCancel}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4em',
                                    padding: '0 1em',
                                    height: '36px',
                                    fontSize: '0.85em',
                                    fontWeight: '500',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '6px',
                                    color: 'rgba(255, 255, 255, 0.85)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={handleCancelEnter}
                                onMouseLeave={handleCancelLeave}
                            >
                                <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>close</span>
                                <span className='footer-button-text' style={{ userSelect: 'none', pointerEvents: 'none' }}>Cancel</span>
                            </button>

                            <button
                                type='button'
                                onClick={handleSubmitClick}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4em',
                                    padding: '0 1.1em',
                                    height: '36px',
                                    fontSize: '0.85em',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={handleSubmitEnter}
                                onMouseLeave={handleSubmitLeave}
                            >
                                <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>check</span>
                                <span className='footer-button-text' style={{ userSelect: 'none', pointerEvents: 'none' }}>Submit</span>
                            </button>
                        </div>
                    )}

                    {/* Select Type */}
                    {pendingInput.type === 'select' && pendingInput.options && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75em',
                            padding: '0.75em 1em'
                        }}>
                            <select
                                value={inputValue}
                                onChange={onInputChange}
                                style={{
                                    flex: 1,
                                    padding: '0 0.85em',
                                    fontSize: '0.9em',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                    minWidth: 0,
                                    cursor: 'pointer',
                                    height: '36px'
                                }}
                                onFocus={handleSelectFocus}
                                onBlur={handleSelectBlur}
                            >
                                <option value='' style={{ backgroundColor: '#1a1a1a' }}>-- Select an option --</option>
                                {Object.entries(pendingInput.options).map(([key, value]) => (
                                    <option key={value} value={value} style={{ backgroundColor: '#1a1a1a' }}>
                                        {key}
                                    </option>
                                ))}
                            </select>

                            <button
                                type='button'
                                onClick={onCancel}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4em',
                                    padding: '0 1em',
                                    height: '36px',
                                    fontSize: '0.85em',
                                    fontWeight: '500',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '6px',
                                    color: 'rgba(255, 255, 255, 0.85)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={handleSelectCancelEnter}
                                onMouseLeave={handleSelectCancelLeave}
                            >
                                <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>close</span>
                                <span className='footer-button-text' style={{ userSelect: 'none', pointerEvents: 'none' }}>Cancel</span>
                            </button>

                            <button
                                type='button'
                                onClick={handleSubmitClick}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4em',
                                    padding: '0 1.1em',
                                    height: '36px',
                                    fontSize: '0.85em',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                                    userSelect: 'none'
                                }}
                                onMouseEnter={handleSelectSubmitEnter}
                                onMouseLeave={handleSelectSubmitLeave}
                            >
                                <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>check</span>
                                <span className='footer-button-text' style={{ userSelect: 'none', pointerEvents: 'none' }}>Submit</span>
                            </button>
                        </div>
                    )}

                    {/* Confirm Type */}
                    {pendingInput.type === 'confirm' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75em',
                            padding: '0.75em 1em'
                        }}>
                            <div style={{
                                flex: '0 1 auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5em',
                                color: '#fff',
                                fontWeight: '500',
                                fontSize: '0.9em',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                userSelect: 'none',
                                cursor: 'default'
                            }} className='footer-confirm-message'>
                                <span className='material-icons' style={{ fontSize: '1.2em', color: '#ffc107', flexShrink: 0, userSelect: 'none' }}>
                                    help_outline
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
                                    {pendingInput.prompt}
                                </span>
                            </div>

                            <div style={{
                                flex: '0 0 auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75em',
                                marginLeft: 'auto'
                            }}>
                                <button
                                    type='button'
                                    onClick={onConfirmNo}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.4em',
                                        padding: '0 1em',
                                        height: '36px',
                                        fontSize: '0.85em',
                                        fontWeight: '500',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '6px',
                                        color: 'rgba(255, 255, 255, 0.85)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                        userSelect: 'none'
                                    }}
                                    onMouseEnter={handleConfirmNoEnter}
                                    onMouseLeave={handleConfirmNoLeave}
                                >
                                    <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>close</span>
                                    <span style={{ userSelect: 'none', pointerEvents: 'none' }}>No</span>
                                </button>

                                <button
                                    type='button'
                                    onClick={onConfirmYes}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.4em',
                                        padding: '0 1.1em',
                                        height: '36px',
                                        fontSize: '0.85em',
                                        fontWeight: '600',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                                        userSelect: 'none'
                                    }}
                                    onMouseEnter={handleConfirmYesEnter}
                                    onMouseLeave={handleConfirmYesLeave}
                                >
                                    <span className='material-icons' style={{ fontSize: '1.1em', userSelect: 'none', pointerEvents: 'none' }}>check</span>
                                    <span style={{ userSelect: 'none', pointerEvents: 'none' }}>Yes</span>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <style>
                {`
                    @media (max-width: 768px) {
                        .footer-button-text {
                            display: none !important;
                        }
                        .footer-confirm-message {
                            display: none !important;
                        }
                    }
                `}
            </style>
        </div>
    );
};

Component.displayName = 'ScriptsPage';
