import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useEffect, useRef, useState } from 'react'
import classes from './App.module.css'
import './styles/utilities.css'
import { DataEngineProvider } from "./utils/app-runtime/data-engine.provider";
import MetadataSelector, { MetadataOption } from './components/MetadataSelector';

import MessageContainer from './components/MessageContainer';
import EnhancedInput, { FileAttachment } from './components/EnhancedInput';

// Import the comprehensive workflow orchestrator
import { workflowOrchestrator, WorkflowUIState } from './utils/workflow-orchestrator';
import { createContextRouterAgent } from './agents/router-agent'

// Import toast notification system
import { ToastProvider, useToast } from './components/ToastNotification';

interface QueryResults {
	me: {
		name: string
	}
}

const query = {
	me: {
		resource: 'me',

	},
}

// Toast Manager Component to handle toast notifications
const ToastManager: FC = () => {
	const { showToast } = useToast();

	// Register toast callback with workflow orchestrator
	useEffect(() => {
		// Update orchestrator callbacks to include toast functionality
		const currentCallbacks = workflowOrchestrator['uiCallbacks'];
		if (currentCallbacks) {
			workflowOrchestrator.registerCallbacks({
				...currentCallbacks,
				showToast: (type, title, message, options) => {
					return showToast({
						type,
						title,
						message,
						...options
					});
				}
			});
		}
	}, [showToast]);

	return null; // This component only manages toasts, doesn't render anything
};

const MyApp: FC = () => {
	const {error, loading, data} = useDataQuery<QueryResults>(query)
	const { showToast } = useToast();

	// Add spin animation CSS for loading indicator
	const spinKeyframes = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

	// Inject the keyframes into the document head
	React.useEffect(() => {
		const style = document.createElement('style');
		style.textContent = spinKeyframes;
		document.head.appendChild(style);
		return () => {
			document.head.removeChild(style);
		};
	}, []);

	// Complete UI state is now managed by the orchestrator
	const [uiState, setUiState] = useState<WorkflowUIState>({
		showQueryInput: true,
		queryText: '',
		queryEnabled: true,
		showProcessing: false,
		showResults: false,
		showChart: false,
		showSelection: false,
		selectionOptions: [],
		selectionMultiple: true,
		conversation: [],
		showConversation: true
	});

	// Get tracker state from orchestrator
	const trackerState = workflowOrchestrator.getTrackerState();

	// Selection complete callback for the orchestrator
	const pendingSelectionCallback = useRef<((selectedItems: any[]) => void) | null>(null);

	// Context router agent instance with orchestrator reference
	const [contextRouterAgent, setContextRouterAgent] = useState<any>(null);

	// UI state for collapsible sections
	const [headerCollapsed, setHeaderCollapsed] = useState(false);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);

	// Register comprehensive callbacks with the orchestrator
	useEffect(() => {
		workflowOrchestrator.registerCallbacks({
			// UI state management - orchestrator fully controls what user sees
			onUIStateChange: (newState) => {
				setUiState(prevState => ({...prevState, ...newState}));
			},

			// Selection handling during workflows
			onSelection: (options, callback) => {
				// Store callback for when user completes selection
				pendingSelectionCallback.current = callback;
			},

			// Chart rendering
			onChartRender: (chartData) => {
				console.log('📊 Chart render callback called:', chartData);
				// Store the chart data and show the chart
				setUiState(prevState => ({
					...prevState,
					showChart: true,
					chartData: chartData
				}));
			},

			// Workflow lifecycle events
			onWorkflowStart: (workflowId, flowType) => {
				console.log(`🎬 Workflow ${workflowId} started: ${flowType}`);
			},
			onWorkflowComplete: (workflowId, result) => {
				console.log(`✅ Workflow ${workflowId} completed`);
			},
			onWorkflowError: (workflowId, error) => {
				console.error(`❌ Workflow ${workflowId} error:`, error);
			}
		});

		// Create context router agent with orchestrator reference
		const agent = createContextRouterAgent(workflowOrchestrator);
		setContextRouterAgent(agent);

		// Initialize new chat session (clear conversation history)
		workflowOrchestrator.initializeNewChatSession();
	}, []);

	// Handle query submission - now adds to conversation
	const handleQuerySubmit = async () => {
		if (!uiState.queryText.trim()) {
			workflowOrchestrator.addAssistantMessage(
				'Empty query detected. Please enter a question or request before submitting. For example: "Show me HIV data" or "Upload CSV file".',
				'error'
			);
			return;
		}

		const queryText = uiState.queryText.trim();

		try {
			// Add user message to conversation
			workflowOrchestrator.addUserMessage(queryText, 'query');

			// Clear the query input
			setUiState(prevState => ({...prevState, queryText: ''}));

			// Start analytics workflow through orchestrator
			const result = await workflowOrchestrator.startWorkflow(
				'analytics',
				{
					flow: 'analytics_query',
					input: {messages: [{role: 'user', content: queryText}]},
					orchestrator: workflowOrchestrator // Pass orchestrator reference for selection interrupts
				},
				async (input) => {
					// Router agent routes to state graph for analytics
					// Extract user messages and pass them properly to the agent
					const userMessages = input.input?.messages || [{role: 'user', content: input.query || ''}];
					console.log('🚀 Invoking context-aware router agent with messages:', userMessages);
					const agentResult = await contextRouterAgent?.invoke({messages: userMessages});
					console.log('📦 Router agent result:', agentResult);

					const lastMessage = agentResult.messages[agentResult.messages.length - 1];
					const responseContent = lastMessage.content as string;

					// Debug the raw response
					console.log('🔍 Last message:', lastMessage);
					console.log('🔍 Raw response content:', responseContent);
					console.log('🔍 Response content length:', responseContent.length);

					try {
						console.log('🔄 Parsing JSON response...');
						const parsed = JSON.parse(responseContent);
						console.log('✅ JSON parse successful:', parsed);
						return parsed;
					} catch (parseError) {
						console.error('❌ JSON parse error:', parseError);
						console.error('❌ Failed to parse response:', responseContent);

						// Return a result that won't crash the workflow
						return {
							success: false,
							error: `JSON parse error: ${parseError.message}`,
							rawResponse: responseContent,
							debug: {
								responseLength: responseContent.length,
								responseType: typeof responseContent,
								first100: responseContent.substring(0, 100)
							},
							type: 'parse_error'
						};
					}
				}
			);

			// Add assistant response to conversation (only for non-specialized cases)
			if (result?.success === false) {
				// Only add error messages to conversation
				workflowOrchestrator.addAssistantMessage(
					result.error || 'Operation failed',
					'error',
					result
				);
			}
			// For successful operations, router agent handles specialized rendering (search, analytics, etc.)

		} catch (error) {
			console.error('Query submission error:', error);
			workflowOrchestrator.addAssistantMessage(
				`Request processing failed: ${error.message}. This may be due to network issues, invalid input format, or system constraints. Please try rephrasing your query or check your connection. If the problem persists, contact support with the error details.`,
				'error',
				{error: error.message, errorType: 'query_processing', timestamp: new Date().toISOString()}
			);
		}
	};

	// Handle query text changes - update local state and keep orchestrator in sync
	const handleQueryChange = (newText: string) => {
		setUiState(prevState => ({...prevState, queryText: newText}));
	};

	// Handle enhanced query submission with file attachments
	const handleEnhancedQuerySubmit = async (text: string, attachments: FileAttachment[], selectedAgent: string) => {
		if (!text.trim() && attachments.length === 0) {
			workflowOrchestrator.addAssistantMessage(
				'No input provided. Please either type a question or attach a file for processing. Supported file types: CSV, PDF, images. Try: "Upload my data file" or "Process this document".',
				'error'
			);
			return;
		}

		const queryText = text.trim();

		try {
			// Add user message to conversation with attachments and selected agent info
			workflowOrchestrator.addUserMessage(queryText, 'query', {attachments, selectedAgent});

			// Clear the query input
			setUiState(prevState => ({...prevState, queryText: ''}));

			// Prepare messages with file content for agents that need it
			const messages = [{role: 'user', content: queryText}];

			// Add file content to messages for agents that can process files
			if (attachments.length > 0) {
				for (const attachment of attachments) {
					try {
						// Determine if file is binary or text based on MIME type
						const isBinary = attachment.type.startsWith('application/') ||
							attachment.type.startsWith('image/') ||
							attachment.name.toLowerCase().endsWith('.pdf');

						let fileContent: Uint8Array | string;

						if (isBinary) {
							// For binary files, read as ArrayBuffer and convert to Uint8Array
							const arrayBuffer = await attachment.file.arrayBuffer();
							fileContent = new Uint8Array(arrayBuffer);
							console.log(`📁 Read binary file: ${attachment.name} (${fileContent.length} bytes)`);
						} else {
							// For text files, read as text
							fileContent = await attachment.file.text();
							console.log(`📄 Read text file: ${attachment.name} (${fileContent.length} characters)`);
						}

						// Register file with orchestrator for agents to access
						const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
						await workflowOrchestrator.registerFile(fileId, fileContent, {
							name: attachment.name,
							type: attachment.type,
							size: attachment.size,
							isBinary: isBinary
						});

						// Set as current file for agents that need it
						workflowOrchestrator['currentFileId'] = fileId;

						// Add file reference to messages with proper typing
						const fileMessage: any = {
							role: 'user',
							content: `File: ${attachment.name}`,
							attachments: [{
								id: fileId,
								name: attachment.name,
								type: attachment.type,
								size: attachment.size
							}]
						};

						// Store binary content separately to preserve it
						if (isBinary) {
							fileMessage.binaryContent = fileContent;
						} else {
							fileMessage.content += `\nContent:\n${fileContent}`;
						}

						messages.push(fileMessage);
						console.log(`📋 Registered file ${attachment.name} with orchestrator as ${fileId}`);
					} catch (fileError) {
						console.warn(`Could not read file ${attachment.name}:`, fileError);
						// Still include the message but without file content
						messages.push({
							role: 'user',
							content: `File attached: ${attachment.name} (${attachment.type}, ${attachment.size} bytes)`
						});
					}
				}
			}

			// Determine flow type and agent function based on selected agent
			let flowType: string;
			let agentFunction: (input: any) => Promise<any>;

			if (selectedAgent === 'auto') {
				// Use router agent for intelligent routing
				flowType = 'router';
				agentFunction = async (input) => {
					console.log('🚀 Invoking context-aware router agent with messages and attachments:', input.input?.messages);
					const agentResult = await contextRouterAgent?.invoke({messages: input.input?.messages});
					console.log('📦 Router agent result:', agentResult);

					const lastMessage = agentResult.messages[agentResult.messages.length - 1];
					const responseContent = lastMessage.content as string;

					try {
						const parsed = JSON.parse(responseContent);
						console.log('✅ JSON parse successful:', parsed);
						return parsed;
					} catch (parseError) {
						console.error('❌ JSON parse error:', parseError);
						return {
							success: false,
							error: `JSON parse error: ${parseError.message}`,
							rawResponse: responseContent,
							type: 'parse_error'
						};
					}
				};
			} else {
				// Use selected agent directly
				flowType = selectedAgent;
				agentFunction = async (input) => {
					console.log(`🎯 Invoking ${selectedAgent} agent directly with messages:`, input.input?.messages);
					const message = { messages: input.input?.messages, orchestrator: workflowOrchestrator };

					// Map selectedAgent to actual agent function and handle LangChain result parsing
					let agentResult;
					switch (selectedAgent) {
						case 'search':
							const { searchAgent } = await import('./agents/search-agent');
							agentResult = await searchAgent.invoke(message);
							break;
						case 'analytics':
							const { createAnalyticsGraphAgent } = await import('./agents/analytics-graph-agent');
							const analyticsAgent = createAnalyticsGraphAgent(workflowOrchestrator);
							agentResult = await analyticsAgent.invoke(message);
							break;
						case 'metadata':
							const { createCrudAgent } = await import('./agents/crud-agent');
							const crudAgent = createCrudAgent();
							agentResult = await crudAgent.invoke(message);
							break;
						case 'aggregate-data-entry':
							const { createRoutedDataEntryAgent } = await import('./agents/routed-data-entry-agent');
							const dataEntryAgent = createRoutedDataEntryAgent(workflowOrchestrator);
							agentResult = await dataEntryAgent.invoke(message);
							break;
						case 'tracker-data-entry':
							const { createTrackerDataAgent } = await import('./agents/tracker-agent');
							const trackerAgent = createTrackerDataAgent(workflowOrchestrator);
							agentResult = await trackerAgent.invoke(message);
							break;
						case 'event-data-entry':
							const { eventsAgent } = await import('./agents/events-agent');
							agentResult = await eventsAgent.invoke(input);
							break;
						default:
							throw new Error(`Unknown agent: ${selectedAgent}`);
					}

					// Handle LangChain-style results (search, analytics agents return LangChain format)
					if (selectedAgent === 'search' || selectedAgent === 'analytics') {
						console.log(`📦 Direct agent ${selectedAgent} result:`, agentResult);

						// Extract the last message content (similar to router agent logic)
						const lastMessage = agentResult.messages[agentResult.messages.length - 1];
						const responseContent = lastMessage.content as string;

						console.log(`🔍 Direct agent ${selectedAgent} response content:`, responseContent);

						try {
							console.log(`🔄 Parsing JSON response from ${selectedAgent} agent...`);
							const parsed = JSON.parse(responseContent);
							console.log(`✅ JSON parse successful for ${selectedAgent}:`, parsed);
							return parsed;
						} catch (parseError) {
							console.error(`❌ JSON parse error for ${selectedAgent}:`, parseError);
							console.error(`❌ Failed to parse ${selectedAgent} response:`, responseContent);

							// Return a result that won't crash the workflow
							return {
								success: false,
								error: `JSON parse error: ${parseError.message}`,
								rawResponse: responseContent,
								debug: {
									responseLength: responseContent.length,
									responseType: typeof responseContent,
									first100: responseContent.substring(0, 100)
								},
								type: 'parse_error'
							};
						}
					} else {
						// Other agents (metadata, data-entry) return direct results
						return agentResult;
					}
				};
			}

			// Start workflow with selected agent
			const result = await workflowOrchestrator.startWorkflow(
				flowType,
				{
					flow: `${selectedAgent}_query`,
					input: {messages},
					selectedAgent,
					orchestrator: workflowOrchestrator
				},
				agentFunction
			);

			// Handle response
			if (result?.success === false) {
				workflowOrchestrator.addAssistantMessage(
					result.error || 'Operation failed',
					'error',
					result
				);
			}

		} catch (error) {
			console.error('Enhanced query submission error:', error);
			workflowOrchestrator.addAssistantMessage(
				`Processing failed: ${error.message}. This may be due to network issues, invalid input format, or system constraints. Please try rephrasing your query or check your connection. If the problem persists, contact support with the error details.`,
				'error',
				{
					error: error.message,
					errorType: 'processing_error',
					selectedAgent,
					timestamp: new Date().toISOString()
				}
			);
		}
	};

	// Handle selection completion - call stored callback and add to conversation
	const handleSelectionComplete = (selectedItems: MetadataOption[]) => {
		if (pendingSelectionCallback.current) {
			// Add user selection to conversation
			const selectionText = `Selected ${selectedItems.length} item(s): ${selectedItems.map(item => item.name).join(', ')}`;
			workflowOrchestrator.addUserMessage(selectionText, 'selection_response', {selectedItems});

			// Call the stored callback
			const transformedItems = selectedItems.map(item => ({
				name: item.name,
				id: item.id,
				type: item.type
			}));

			pendingSelectionCallback.current(transformedItems);
			pendingSelectionCallback.current = null;
		}
	};

	// Tracker workflow handlers - now delegate to orchestrator
	const handleConfigureProcessing = (config: {
		orgUnit: string;
		programId: string;
		attributeMappings: Record<string, string>;
	}) => {
		workflowOrchestrator.handleConfigureProcessing(config);
	};

	const handleUploadDocument = (file: File) => {
		workflowOrchestrator.handleUploadDocument(file);
	};

	const handleRetryProcessing = () => {
		workflowOrchestrator.handleRetryProcessing();
	};

	const handleConfirmSave = () => {
		workflowOrchestrator.handleConfirmSave();
	};

	const handleCancelSave = () => {
		workflowOrchestrator.handleCancelSave();
	};

	// Loading and error states for the main app
	if (error) {
		return <span>{i18n.t('ERROR')}</span>
	}

	if (loading) {
		return <span>{i18n.t('Loading...')}</span>
	}

	return (
		<div className={classes.container}>
			{/* Collapsible Header Section */}
			<div style={{
				position: 'relative',
				marginBottom: headerCollapsed ? 'var(--space-2)' : 'var(--space-6)',
				transition: 'margin-bottom var(--transition-normal)'
			}}>
				{/* Header Toggle Button */}
				<button
					onClick={() => setHeaderCollapsed(!headerCollapsed)}
					style={{
						position: 'absolute',
						top: 'var(--space-2)',
						right: 'var(--space-2)',
						backgroundColor: 'var(--color-bg-primary)',
						border: '1px solid var(--color-border-light)',
						borderRadius: 'var(--radius-full)',
						width: '32px',
						height: '32px',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxShadow: 'var(--shadow-sm)',
						transition: 'var(--transition-fast)',
						zIndex: 10
					}}
					className="hover-lift"
					title={headerCollapsed ? "Expand header" : "Collapse header"}
				>
					{headerCollapsed ? "↓" : "↑"}
				</button>

				{/* Header Content */}
				<div style={{
					textAlign: 'center',
					padding: headerCollapsed ? 'var(--space-2) var(--space-8)' : 'var(--space-4) var(--space-8)',
					backgroundColor: headerCollapsed ? 'var(--color-bg-secondary)' : 'transparent',
					borderRadius: headerCollapsed ? 'var(--radius-lg)' : '0',
					border: headerCollapsed ? '1px solid var(--color-border-light)' : 'none',
					transition: 'all var(--transition-normal)',
					overflow: 'hidden'
				}}>
					<div style={{
						opacity: headerCollapsed ? 0.7 : 1,
						transform: headerCollapsed ? 'scale(0.95)' : 'scale(1)',
						transition: 'opacity var(--transition-normal), transform var(--transition-normal)'
					}}>
						<h1 style={{
							margin: '0 0 var(--space-2) 0',
							color: 'var(--color-text-primary)',
							fontSize: headerCollapsed ? 'var(--font-size-lg)' : 'var(--font-size-3xl)',
							fontWeight: 'var(--font-weight-bold)',
							lineHeight: 'var(--line-height-tight)',
							transition: 'font-size var(--transition-normal)'
						}}>
							{headerCollapsed ? 'DHIS2 Assistant' : i18n.t('Hello {{name}}', {name: data?.me?.name})}
						</h1>
						{!headerCollapsed && (
							<h3 style={{
								margin: 0,
								color: 'var(--color-text-secondary)',
								fontSize: 'var(--font-size-lg)',
								fontWeight: 'var(--font-weight-normal)',
								lineHeight: 'var(--line-height-snug)',
								opacity: headerCollapsed ? 0 : 1,
								transition: 'opacity var(--transition-normal)'
							}}>
								{i18n.t('DHIS2 Orchestrated Multi-Agent Assistant')}
							</h3>
						)}
					</div>
				</div>
			</div>

			{/* Main Chat Interface with Side Panel */}
			<div style={{
				display: 'flex',
				position: 'relative',
				width: '95%',
				maxWidth: '1400px',
				margin: 'var(--space-6) auto'
			}}>
				{/* Side Panel for Metadata Selection */}
				<div style={{
					width: sidePanelOpen ? '300px' : '0',
					transition: 'width var(--transition-normal)',
					overflow: 'hidden',
					backgroundColor: 'var(--color-bg-primary)',
					border: '1px solid var(--color-border-light)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-md)',
					marginRight: sidePanelOpen ? 'var(--space-4)' : '0'
				}}>
					{sidePanelOpen && (
						<div style={{
							padding: 'var(--space-4)',
							height: '100%',
							overflowY: 'auto'
						}}>
							<div style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								marginBottom: 'var(--space-4)',
								paddingBottom: 'var(--space-2)',
								borderBottom: '1px solid var(--color-border-light)'
							}}>
								<h4 style={{
									margin: 0,
									color: 'var(--color-text-primary)',
									fontSize: 'var(--font-size-lg)',
									fontWeight: 'var(--font-weight-semibold)'
								}}>
									Metadata Selection
								</h4>
								<button
									onClick={() => setSidePanelOpen(false)}
									style={{
										backgroundColor: 'var(--color-bg-secondary)',
										border: '1px solid var(--color-border-light)',
										borderRadius: 'var(--radius-md)',
										width: '28px',
										height: '28px',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 'var(--font-size-sm)',
										transition: 'var(--transition-fast)'
									}}
									className="hover-lift"
									title="Close panel"
								>
									×
								</button>
							</div>

							<div style={{
								color: 'var(--color-text-secondary)',
								fontSize: 'var(--font-size-sm)',
								marginBottom: 'var(--space-4)',
								lineHeight: 'var(--line-height-relaxed)'
							}}>
								Select metadata items for your analysis. You can search, filter, and select multiple
								items as needed.
							</div>

							{/* Metadata selector would go here when selection is active */}
							{uiState.showSelection && uiState.selectionOptions.length > 0 ? (
								<MetadataSelector
									selectionOptions={uiState.selectionOptions.map(opt => ({
										...opt,
										type: opt.type
									}))}
									originalQuery={uiState.queryText}
									onSelection={(selectedItems) => handleSelectionComplete(selectedItems)}
									allowMultiple={uiState.selectionMultiple}
								/>
							) : (
								<div style={{
									textAlign: 'center',
									color: 'var(--color-text-muted)',
									padding: 'var(--space-8)',
									fontSize: 'var(--font-size-sm)'
								}}>
									No selection required at this time
								</div>
							)}
						</div>
					)}
				</div>

				{/* Main Chat Container */}
				<div style={{
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
					minHeight: '400px',
					maxHeight: '80vh',
					border: '1px solid var(--color-border-light)',
					borderRadius: 'var(--radius-lg)',
					overflow: 'hidden',
					backgroundColor: 'var(--color-bg-primary)',
					boxShadow: 'var(--shadow-md)',
					transition: 'all var(--transition-normal)',
					position: 'relative'
				}}>
					{/* Side Panel Toggle Button */}
					<button
						onClick={() => setSidePanelOpen(!sidePanelOpen)}
						style={{
							position: 'absolute',
							top: 'var(--space-4)',
							right: 'var(--space-4)',
							backgroundColor: 'var(--color-primary)',
							color: 'var(--color-text-inverse)',
							border: 'none',
							borderRadius: 'var(--radius-full)',
							width: '40px',
							height: '40px',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							boxShadow: 'var(--shadow-md)',
							transition: 'var(--transition-fast)',
							zIndex: 15,
							fontSize: 'var(--font-size-lg)',
							fontWeight: 'var(--font-weight-bold)'
						}}
						className="hover-lift"
						title={sidePanelOpen ? "Close selection panel" : "Open selection panel"}
					>
						{sidePanelOpen ? "✕" : "⚙️"}
					</button>
					{/* Conversation Display Area */}
					{uiState.showConversation && (
						<div style={{
							flex: 1,
							position: 'relative',
							overflow: 'hidden'
						}}>
							<MessageContainer messages={uiState.conversation}/>

							{/* Enhanced Processing Overlay */}
							{uiState.showProcessing && (
								<div className="processing-overlay-elegant" style={{
									position: 'absolute',
									bottom: '100px', // Above input area
									right: '20px',
									zIndex: 10,
									background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95))',
									borderRadius: '16px',
									padding: '20px',
									boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)',
									border: '1px solid rgba(33, 150, 243, 0.2)',
									minWidth: '280px',
									maxWidth: '400px',
									backdropFilter: 'blur(12px)',
									animation: 'slide-in-up 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
								}}>
									{/* Animated background gradient */}
									<div style={{
										position: 'absolute',
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
										background: 'linear-gradient(45deg, transparent, rgba(33, 150, 243, 0.03), transparent)',
										backgroundSize: '200% 200%',
										animation: 'gradient-shift 3s ease infinite',
										borderRadius: '16px',
										pointerEvents: 'none'
									}} />

									<div style={{
										display: 'flex',
										alignItems: 'center',
										gap: '16px',
										position: 'relative',
										zIndex: 1
									}}>
										{/* Enhanced progress indicator */}
										<div className="progress-ring-elegant" style={{
											position: 'relative',
											width: '40px',
											height: '40px',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center'
										}}>
											{/* Outer ring - gradient border */}
											<div style={{
												position: 'absolute',
												width: '40px',
												height: '40px',
												border: '3px solid transparent',
												borderTop: '3px solid #2196f3',
												borderRight: '3px solid #1976d2',
												borderRadius: '50%',
												animation: 'spin 1.5s linear infinite'
											}} />

											{/* Inner ring - pulsing effect */}
											<div style={{
												position: 'absolute',
												width: '20px',
												height: '20px',
												border: '2px solid #e3f2fd',
												borderRadius: '50%',
												animation: 'pulse-ring 1.5s ease-out infinite'
											}} />

											{/* Center dot */}
											<div style={{
												width: '6px',
												height: '6px',
												backgroundColor: '#2196f3',
												borderRadius: '50%',
												animation: 'pulse-dot 1.5s ease-in-out infinite'
											}} />
										</div>

										{/* Progress content */}
										<div style={{ flex: 1 }}>
											<div style={{
												fontSize: '16px',
												fontWeight: '700',
												color: '#1976d2',
												marginBottom: '6px',
												letterSpacing: '-0.01em'
											}}>
												Processing Request
											</div>
											<div style={{
												fontSize: '14px',
												color: '#64748b',
												lineHeight: '1.5',
												fontWeight: '400'
											}}>
												{uiState.processingMessage || 'Analyzing your request and preparing response...'}
											</div>

											{/* Subtle progress hint */}
											<div style={{
												marginTop: '8px',
												fontSize: '12px',
												color: '#94a3b8',
												fontStyle: 'italic'
											}}>
												This may take a few moments
											</div>
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Selection overlay (when selection is active) */}
					{uiState.showSelection && uiState.selectionOptions.length > 0 && (
						<div style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							backgroundColor: 'rgba(255, 255, 255, 0.95)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 20
						}}>
							<div style={{
								backgroundColor: 'white',
								borderRadius: '8px',
								padding: '20px',
								border: '1px solid #e0e0e0',
								maxWidth: '600px',
								maxHeight: '80vh',
								overflow: 'auto'
							}}>
								<MetadataSelector
									selectionOptions={uiState.selectionOptions.map(opt => ({
										...opt,
										type: opt.type
									}))}
									originalQuery={uiState.queryText}
									onSelection={(selectedItems) => handleSelectionComplete(selectedItems)}
									allowMultiple={uiState.selectionMultiple}
								/>
							</div>
						</div>
					)}

					{/* Enhanced Input Section - Always at the bottom */}
					<div style={{
						borderTop: '1px solid #e0e0e0',
						padding: '16px',
						backgroundColor: '#f8f9fa'
					}}>
						<div style={{maxWidth: '1200px', margin: '0 auto'}}>
							<EnhancedInput
								value={uiState.queryText}
								onChange={handleQueryChange}
								onSubmit={(text, attachments, selectedAgent) => handleEnhancedQuerySubmit(text, attachments, selectedAgent)}
								disabled={!uiState.queryEnabled}
								isProcessing={uiState.showProcessing}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
};

export default (props: any) => (
	<DataEngineProvider>
		<ToastProvider>
			<ToastManager />
			<MyApp {...props} />
		</ToastProvider>
	</DataEngineProvider>
)
