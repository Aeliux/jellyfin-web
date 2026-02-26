import React, { useState, useCallback, useEffect, useRef } from 'react';
import Page from 'components/Page';
import { useApi } from 'hooks/useApi';
import type { Api } from '@jellyfin/sdk';
import Button from 'elements/emby-button/Button';

interface ScriptMetadata {
    name: string;
    description: string;
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

export const Component = () => {
    const { api, user } = useApi();
    const [scripts, setScripts] = useState<Script[]>([]);
    const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());
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
        setRunningScripts(prev => new Set(prev).add(scriptId));
        setConsoleOutput(prev => {
            const newMap = new Map(prev);
            newMap.set(scriptId, []);
            return newMap;
        });

        log(scriptId, `Starting script: ${script.metadata.name}`);

        try {
            await script.metadata.execute(api, (message: string) => log(scriptId, message));
            log(scriptId, 'S: Script completed successfully');
        } catch (error) {
            log(scriptId, `E: Error: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`Script ${scriptId} error:`, error);
        } finally {
            setRunningScripts(prev => {
                const newSet = new Set(prev);
                newSet.delete(scriptId);
                return newSet;
            });
        }
    }, [api, log]);

    const clearConsole = useCallback((scriptId: string) => {
        setConsoleOutput(prev => {
            const newMap = new Map(prev);
            newMap.delete(scriptId);
            return newMap;
        });
    }, []);

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
                                const output = consoleOutput.get(script.id) || [];

                                return (
                                    <ScriptCard
                                        key={script.id}
                                        script={script}
                                        isRunning={isRunning}
                                        output={output}
                                        onRun={runScript}
                                        onClear={clearConsole}
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
    output: ConsoleMessage[];
    onRun: (script: Script) => void;
    onClear: (scriptId: string) => void;
    consoleRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const ScriptCard: React.FC<ScriptCardProps> = ({ script, isRunning, output, onRun, onClear, consoleRefs }) => {
    const handleRun = useCallback(() => {
        onRun(script);
    }, [onRun, script]);

    const handleClear = useCallback(() => {
        onClear(script.id);
    }, [onClear, script.id]);

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

    return (
        <div className='verticalSection verticalSection-extrabottompadding' style={{ marginBottom: '2em' }}>
            <div className='paperList' style={{
                padding: '1.5em',
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
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
                    <div style={{ display: 'flex', gap: '0.5em', marginLeft: '1em' }}>
                        <Button
                            type='button'
                            className={`raised ${isRunning ? '' : 'button-submit'}`}
                            onClick={handleRun}
                            disabled={isRunning}
                            icon={isRunning ? 'stop' : 'play_arrow'}
                            title={isRunning ? 'Running...' : 'Run'}
                        />
                        {output.length > 0 && (
                            <Button
                                type='button'
                                className='raised'
                                onClick={handleClear}
                                icon='clear'
                                title='Clear'
                            />
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
                                    {entry.message}
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
