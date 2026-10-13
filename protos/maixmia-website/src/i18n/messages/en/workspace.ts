// 工作台展示文案与确定性的演示应答。
export const workspace = {
  title: 'Workspace',
  newChat: 'New conversation',

  switcher: {
    filterLabel: 'List scope',
    filterConversations: 'Conversations',
    filterFiles: 'Files',
  },
  // Sidebar agent selector: the trigger's full name comes from the agents table; these two
  // strings only feed the popover's accessible name and the current-option marker. The selector
  // expresses "which agent you are working under" — it decides which projects the sidebar shows.
  // (The selector itself now lives in the bottom agent bar; agentSelector is reused as that
  // strip's tablist accessible name.)
  agentSelector: 'Switch agent',
  agentSelected: 'Selected',
  // Agent bar (the workspace's bottom strip): a tab strip of the three agents plus an overflow
  // menu when they do not fit. The tablist's accessible name reuses agentSelector; these two
  // only name the overflow trigger and supplement it with the collapsed count.
  agentBar: {
    menu: 'All agents',
    collapsed: '{count} collapsed',
  },
  // Sidebar: the agent-workspace panel, with the projects section beneath it (projects + open
  // project), no longer a set of workspace files.
  workspacePanel: 'Agent workspace',
  openSidebar: 'Open sidebar',
  closeSidebar: 'Close sidebar',
  closeTab: 'Close {title}',
  // Projects section: each project is a directory on the agent host (the CLI's cwd); expanding it
  // reveals its file tree.
  projects: 'Projects',
  projectsEmpty: 'No projects open yet',
  projectsError: 'Unable to load projects',
  openProject: 'Open project',
  closeProject: 'Close project',
  // Accessible name of the project row's "⋯" action menu. (expandProject / collapseProject were
  // dropped when directory rows moved to a whole-row button with aria-expanded.)
  projectActions: 'Project actions',
  // "Add to conversation" button on a file row: the non-drag equivalent (WCAG 2.5.7) that adds the
  // file as an attachment of the focused region's active conversation.
  addFileToConversation: 'Add "{name}" to the conversation',
  treeLoading: 'Loading files…',
  treeEmpty: 'This project has no files yet',
  treeError: 'Unable to load project files',
  // "Open project" dialog: lists directories detected on the agent host, searchable and selectable.
  pickerTitle: 'Open project',
  pickerSearch: 'Search directories',
  pickerEmpty: 'No directories detected',
  pickerSearchEmpty: 'No matching directories',
  // File count of a candidate directory; the carrier substitutes {count}.
  fileCount: '{count} files',
  pickerGit: 'Git repo',
  pickerAlreadyOpen: 'Already open',
  pickerOpen: 'Open',
  pickerCancel: 'Cancel',
  // Conversation switcher: the "Conversations ▾" dropdown at the heading's top-right. Its name is
  // both the trigger's visible text and the panel's accessible name.
  conversations: 'Conversations',
  searchConversations: 'Search conversations',
  // Visible placeholder of the search field: the panel is 420px wide, so the full phrase fits.
  // The accessible name stays searchConversations (complete, and the stable name tests rely on).
  searchPlaceholder: 'Search conversations',
  clearSearch: 'Clear search',
  searchEmpty: 'No matching conversations',
  // Match reason: a title hit has no specific turn to jump to; a body hit jumps to and highlights it.
  matchTitle: 'Title match',
  matchBody: 'Message match',
  // Badge on the trigger: a number plus an accessible name (the visible text is only
  // "Conversations", so a screen reader needs to know what is waiting).
  awaitingCount: '{count} waiting for confirmation',
  // The menu button on the heading's right (always present): the entry to overflowed tabs and to
  // search. Its aria-label is assembled from three parts — base name + (when some are collapsed)
  // the count collapsed + (when any is waiting) how many are waiting.
  conversationMenu: 'All conversations and search',
  hiddenCount: '{count} collapsed',
  hiddenAwaiting: '{count} waiting for confirmation',
  // Screen-reader announcement after a tab is reordered (drag or shortcut).
  tabMoved: '{title} moved to position {index} of {total}',
  // The panel's two groups: the pinned "waiting on you" group (still waiting and not yet opened)
  // and the "this project" group (everything else).
  awaitingGroup: 'Waiting on you · {count}',
  projectGroup: 'This project · {count}',
  you: 'You',
  assistant: 'Mia',
  transcript: 'Conversation',
  loading: 'Loading conversation…',
  emptyTitle: 'Yizhou, what shall we work on?',
  emptyBody: 'Start with an idea. Tell Mia your goal, and we will work out the next step together.',
  inputLabel: 'Message to Mia',
  // 每个输入框按会话可区分(见 zh-CN 同名键的说明);无标题时回落到 inputLabel。
  inputLabelOf: 'Message to "{name}"',
  placeholder: 'Describe a task, or keep the conversation going…',
  inputHint: 'Enter to send · Shift+Enter for a new line',
  // Model dropdown on the composer's bottom row (disclosure + listbox): trigger name, panel name,
  // and the current-item marker.
  modelMenu: {
    label: 'Choose a model',
    current: 'Current model',
    window: 'Context',
  },
  // Display names of the model catalog (i18n key lives in data/models.ts). Brand names are the same
  // in every language.
  models: {
    sonnet45: 'Claude Sonnet 4.5',
    opus41: 'Claude Opus 4.1',
    sonnet45_1m: 'Claude Sonnet 4.5 (1M)',
  },
  // One-line note for each model (the secondary line inside a dropdown option); no vague words.
  modelDescriptions: {
    balanced: 'Balanced speed and capability for everyday tasks',
    deep: 'Stronger reasoning and writing for complex tasks',
    longContext: 'A longer context window for large files and long conversations',
  },
  // Attachment area (inside the composer card, above the textarea) and its four entry points.
  composer: {
    attachments: 'Attachments',
    add: 'Add files',
    remove: 'Remove attachment: {name}',
    pastedText: 'Pasted text',
    pastedImage: 'Pasted image',
    lines: '{count} lines',
    // 单数形:英文的「1 lines」是可见的语病,故单列一条(中文两份同值)。
    linesOne: '{count} line',
    chars: '{count} chars',
    added: 'Added attachment: {name}',
    removed: 'Removed attachment: {name}',
    tooLarge: '"{name}" exceeds the {limit} limit and was not added',
    tooMany: 'A conversation can carry at most {count} attachments',
    dropHint: 'Drop to add this file to the conversation',
  },
  stop: 'Stop generating',
  regenerate: 'Regenerate',
  queued: 'Thinking…',
  backToBottom: 'Back to bottom',
  errorTitle: 'Unable to load this conversation',
  errorBody: 'The demo connection was interrupted. Retry to continue this conversation.',
  retry: 'Retry',
  sessionsEmpty: 'This project has no conversations yet',
  // Shown when every conversation is already on screen (and therefore hidden from this list) —
  // a different situation from sessionsEmpty.
  sessionsAllDisplayed: 'Every conversation in this project is already on screen',
  sessionsError: 'Unable to load conversations',
  sendError: 'Your message was not sent. Please try again.',
  invalidSession: 'Conversation not found',
  invalidProject: 'Project not found',
  unknownDirectory: 'Directory not found',
  emptyMessage: 'Enter a message first',
  invalidAgent: 'Agent not found',
  noConfirmation: 'No confirmation pending',
  fileError: 'The connection was interrupted while reading the file',
  fileNotFound: 'File not found',
  sessions: {
    weekly: 'Turn project updates into an action plan',
    roadmap: 'Plan next quarter’s roadmap',
    incident: 'Review the production incident',
    budget: 'Reconcile this quarter’s budget',
    launch: 'Pre-launch checklist for the new feature',
    hiring: 'Organize interview feedback',
    research: 'User interviews: key findings',
    knowledge: 'Organize the team knowledge base',
    quarterly: 'Generate the quarterly review data',
    release: 'Tidy the release note changes',
  },
  // Secondary line of a conversation list item (used by mocks): a quick scan of what it covers.
  previews: {
    weekly: 'Sort this week’s progress and the 15-minute Friday demo',
    roadmap: 'Converge on goals, resourcing, and risk',
    incident: 'Fix the timeline first, then the improvements',
    budget: 'Reconcile each track’s spend and headroom',
    launch: 'Four pre-launch checks: triggers, copy, destination, recovery',
    hiring: 'Standardize how interview feedback is written',
    research: 'Keep the “quote → observation → hypothesis” layers',
    knowledge: 'Start with the five most-asked questions of the last two weeks',
    quarterly: 'Back-fill the quarterly schedule from each track’s progress',
    release: 'Group the changed entries into one checklist by module',
  },
  // State chips of a project entry. `none` renders no chip (unchanged, saves width); `pending`
  // appears only while waiting for input on an affected entry.
  entryStates: {
    created: 'Created',
    modified: 'Modified',
    pending: 'Pending',
  },
  // Runtime telemetry: accessible name and group labels for the single-line status bar under the
  // composer.
  telemetry: {
    label: 'Run status',
    context: 'Context usage',
  },
  // Status words: the live client generation state takes priority (queued → Thinking, streaming →
  // Generating, stopped/complete), falling back to AgentRuntime.status when idle (including
  // waiting for confirmation). The word carries no concrete action; statusDetails supplies it.
  statusWords: {
    idle: 'Idle',
    thinking: 'Thinking',
    streaming: 'Generating',
    waiting: 'Waiting for confirmation',
    stopped: 'Stopped',
    complete: 'Complete',
  },
  // Session status words: one-to-one with the contract's SessionStatus; used for the tab's title
  // (mouse-readable) and its status icon. "Unseen" is a view-state and is not expressed here — it
  // decides whether the awaiting / completed icon is shown.
  sessionStatus: {
    new: 'New conversation',
    streaming: 'Responding',
    awaiting: 'Awaiting',
    completed: 'Done',
    idle: 'Idle',
  },
  // Concrete action copy for runtime telemetry: mocks provide the key (statusDetail) and the
  // carrier resolves it — vague words like "processing" are not allowed.
  statusDetails: {
    summarizing: 'Summarizing this week’s project progress',
    draftingOutline: 'Drafting the interview guide',
    revisingRelease: 'Rewriting the release notes',
    awaitingConfirm: 'Waiting for you to confirm a file rewrite',
  },
  // Concrete action copy for the client-side generation states: these states have no runtime action
  // to read, so the action word is supplied here. The status item is always "status · action", and
  // this action gives the user the "what is it doing" they most need while the agent works.
  // `idle` is only produced by the local override after a rejected confirmation — the runtime's
  // action is stale by then, so it gets its own honest word instead.
  statusActions: {
    queued: 'Working through your request',
    streaming: 'Writing the reply',
    stopped: 'Stopped generating',
    complete: 'The reply is complete',
    idle: 'Waiting for your next instruction',
  },
  // "Waiting for input" confirmation request (used by mocks) and the confirmation card's copy.
  // The file name is a technical identifier, written the same way in every language.
  confirmation: {
    title: 'Your confirmation is needed',
    summary: 'Rewrite “release-notes.md” with the new draft',
    detail: 'The generated version will be written back to “release-notes.md”. The current content will be replaced and cannot be restored from the project directory.',
    affectedFiles: 'Affected files',
    viewDetail: 'View details',
    hideDetail: 'Hide details',
    allow: 'Allow',
    reject: 'Reject',
    // The one-line record the card collapses into after a decision (an audit trail that stays).
    allowed: 'Allowed',
    rejected: 'Rejected',
    // The agent's follow-up message after a decision: allow proceeds with the new draft, reject
    // takes a different route.
    followUpAllowed: 'Rewrote “release-notes.md” with the new draft and updated the three links that reference it.',
    followUpRejected: 'Dropped this rewrite and produced a comparison draft instead; the original file is unchanged.',
    // The second "waiting" conversation (quarterly): its own request copy, aligned with its file.
    quarterlySummary: 'Rewrite “release-plan.csv” with the latest data',
    quarterlyDetail: 'This week’s actual progress will be written back into the plan column of “release-plan.csv”. The current schedule will be replaced and cannot be restored from the project directory.',
  },
  // ---- File bar (the strip under the composer) and file panel (double-click a file in the tree
  // to render it on the right) ----
  // The file bar lists the files opened in the current conversation, each tab carrying the same
  // state chip as the file tree (Created / Modified / Pending) — so the strip is not just "what is
  // open" but an overview of "which files the agent touched".
  fileBar: {
    label: 'Open files',
    closeFile: 'Close {name}',
    menu: 'All open files and recently opened',
    hiddenCount: '{count} collapsed',
    // The menu's two groups: "Open" lists **every** open file (including the ones already visible in
    // the strip — mirroring the conversation menu, which lists all sessions and marks the current one),
    // then "Recently closed" (closing is not deleting).
    openGroup: 'Open · {count}',
    recentClosed: 'Recently closed',
    // Empty state of the always-present strip: it also carries the job of teaching the gesture.
    empty: 'Double-click a file on the left to open it here',
    menuEmpty: 'Nothing opened yet',
    // A tab's title (mouse-readable): path plus how it was opened. File names are technical
    // identifiers, written the same way in every language.
    // ---- Tearing a tab down into a floating window / dropping one back onto the strip ----
    // The tab's "pop out" button (the non-drag path for WCAG 2.5.7); the carrier fills in {name}.
    popOut: 'Pop {name} out into a floating window',
    // The pop-out button has moved out of the tab order (see the component's comment); its keyboard
    // path is now the shortcut. The title is deliberately **bilingual**: whichever the UI language is,
    // hovering shows both the action and the shortcut.
    popOutTitle: 'Pop {name} out as a floating window · Ctrl/Cmd+Shift+M — 把 {name} 拆出为悬浮窗口',
    // Drop-outcome announcements while dragging (role="status"): say what releasing would do.
    tearOut: 'Popped {name} out; release to keep it floating',
    tearAttach: 'Put {name} back on the tab strip',
    dockTarget: 'Release to dock {name} back onto the tab strip',
    // Hint badge shown while a floating window is dragged over the strip (must match what docking does).
    dockHint: 'Release here to maximize and reclaim this tab position',
    // Announced when an already-open window is shown (file tree / recently closed). The animation is
    // only redundant emphasis; the text plus the region actually switching carry the information
    // (WCAG: information must not be conveyed by motion alone).
    revealAnnounce: 'Switched to "{name}"',
    // When a docked window is shown while a floating one covers its region, the covering windows are
    // tucked away first (this repo's two-layer stacking can't lift a docked window above the overlay).
    // {count} is replaced with how many were tucked away.
    occludedAnnounce: 'Tucked away {count} floating window(s) that were covering this area',
  },
  // Conversation window (how a conversation looks once torn out of the tab strip into a floating window):
  // title bar / close / drop hint. Conversations share the **same** window mechanism as files, so the tab's
  // "pop out" button and the drag announcements **reuse the fileBar copy** ({name} is filled with the session
  // title); only the drop hint is separate — the file one's "maximize" is off for a conversation (there is no
  // maximized state; it just docks back onto the strip and takes a tab).
  chatWindow: {
    label: 'Conversation window',
    close: 'Close conversation window',
    headerLabel: 'Conversation title bar',
    headerHint: 'Drag the title bar to move · drop onto the top tab strip to dock',
    dock: 'Dock back onto the tab strip',
    dockHint: 'Release here to dock this conversation back onto the tab strip',
  },
  // Window layer (shared by **every** floating window): accessible names for the resize handles
  // (APG Window Splitter) plus the key hint. The wording is deliberately neutral ("window", not
  // "panel") — file and conversation windows share the same handles.
  windowFrame: {
    resizeRight: 'Resize window width (right edge)',
    resizeLeft: 'Resize window width (left edge)',
    resizeBottom: 'Resize window height (bottom edge)',
    resizeTop: 'Resize window height (top edge)',
    resizeHint: 'Arrow keys to resize · Shift for a large step · Home/End for min/max',
  },
  // The file panel shows the whole file with change markers by default (not just diff fragments),
  // and can switch to unified / side-by-side diff. Line markers use shapes, not colour alone
  // (added +, removed −, modified ~); word-level highlight marks what actually changed.
  filePanel: {
    label: 'File panel',
    close: 'Close file panel',
    // When docked, the ✕ closes this file's tab (the panel occupies the region's content area, so
    // merely hiding the window has no visible effect and leaves the region rendering a hidden member);
    // only the floating form hides the window.
    closeTab: 'Close this file tab',
    // Top pane switcher: preview (read-only presentation) / source (editable) / changes (the existing diffs).
    // Note: the preview pane only serves kinds that have a presentation **different from their text**
    // (markdown / html / image); plain text (code / .conf / .sh …) has source / changes only.
    // See file-panel.vue for the naming and the rationale.
    paneLabel: 'Display mode',
    panePreview: 'Preview',
    paneSource: 'Source',
    paneChange: 'Changes',
    // The preview pane is read-only, so the Source segment is the **only** edit entry; its hint says so.
    sourceHint: 'Source · editable',
    // Alt text for images and the accessible name of the HTML preview frame.
    imageAlt: 'Image: {name}',
    htmlPreview: 'HTML preview',
    // Shown when a single mermaid diagram fails to render (that block falls back to its source).
    diagramFailed: 'This diagram could not be rendered, so its source is shown instead.',
    viewLabel: 'View',
    viewFile: 'Whole file',
    viewUnified: 'Unified diff',
    viewSide: 'Side-by-side',
    sideUnavailable: 'The window is too narrow, so side-by-side fell back to unified',
    wrap: 'Wrap lines',
    // Title bar (also the drag handle while floating): accessible name plus hover hint.
    // Double-click means different things in each mode, so there are two hints.
    headerLabel: 'File title bar',
    headerHint: 'Drag the title bar to move the window · double-click it to dock into the content area',
    headerHintDocked: 'Double-click the title bar to float the window again',
    moveHint: 'Arrow keys move the window',
    // The float ↔ dock native button (an equivalent keyboard path on the title bar): its label follows the mode.
    dock: 'Dock into the content area',
    float: 'Float as a separate window',
    resetGeometry: 'Reset window position and size',
    // Placement-change announcements (role="status").
    dockedAnnounce: '{name} docked into the content area',
    floatedAnnounce: '{name} floated back as a separate window',
    // Column headers of the side-by-side diff (left = before, right = after).
    oldLabel: 'Before',
    newLabel: 'After',
    fold: 'Expand {count} unchanged lines',
    unchangedCount: '{count} unchanged lines',
    added: 'Added line',
    removed: 'Removed line',
    modified: 'Modified line',
    unchanged: 'Unchanged',
    addedStat: '+{count}',
    removedStat: '−{count}',
    loading: 'Loading file…',
    errorTitle: 'Unable to read this file',
    errorBody: 'The connection was interrupted. Retry to keep viewing.',
    retry: 'Retry',
    emptyTitle: 'Cannot preview this file',
    emptyBody: 'This is a binary file; the workspace previews text content only.',
    // ---- Data-file previews (CSV table / JSON tree and table) ----
    // Both previews are **read-only**; the copy says what this is and what it can do, never
    // implying an edit (editing always goes through the Source pane). The row-number corner
    // header is screen-reader-only, so its name is carried by aria-label.
    rowNumber: 'Row number',
    // CSV: the table's accessible name, plus the empty-table and over-the-row-cap notes.
    csvTableLabel: 'Data table',
    csvEmpty: 'This table has no content.',
    csvTruncated: 'Showing the first {shown} rows of {total}',
    // JSON: accessible names for both views, the tree/table switch, the expand controls, and the
    // two-line fallback for a parse failure.
    jsonTreeLabel: 'JSON structure',
    jsonTableLabel: 'JSON table',
    jsonViewLabel: 'Display form',
    jsonViewTree: 'Tree',
    jsonViewTable: 'Table',
    jsonExpandLabel: 'Expand controls',
    jsonExpandAll: 'Expand all',
    jsonCollapseAll: 'Collapse all',
    jsonExpandNode: 'Expand {key}',
    jsonCollapseNode: 'Collapse {key}',
    jsonRootLabel: 'root',
    jsonError: 'This is not valid JSON: {message}',
    jsonErrorHint: 'Switch to the Source pane to read the raw content.',
  },
  // ---- Region splitting: drop a tab on a region's edge to split a new region off along that edge;
  // regions are separated by draggable splitters ----
  regions: {
    resizeSeparator: 'Resize regions',
    resizeHint: 'Arrow keys to resize · Home / End for the extremes',
    // Drop hints while dragging a tab over another region (same language as the dock hint):
    // edge = split, interior = merge.
    splitRight: 'Release to create a new region to the right',
    splitBottom: 'Release to create a new region below',
    mergeHint: 'Release to merge into this region',
    splitAnnounce: 'Split {name} into a new region',
    mergeAnnounce: 'Merged {name} into that region',
    // Announcement (role="status") when a region's members empty out and the region is removed.
    // The root region cannot be removed, so this never fires for it.
    regionClosed: 'Closed an empty region',
  },
  // Onboarding page: the root region has neither members nor children, so the whole right side has
  // nothing to show. This is **not** the same as the empty-slot placeholder (where a region merely
  // has no active member), so the copy is separate and does not reuse emptyTitle / emptyBody.
  // Only title / body / primary button: the body just points at "new conversation".
  onboarding: {
    title: 'Nothing open here yet',
    body: 'Start a conversation and tell Mia your goal.',
  },
  // Workspace agent names: the conversation-heading subtitle shows the session's owning agent.
  agents: {
    planning: 'Planning agent',
    research: 'Research agent',
    writing: 'Writing agent',
  },
  messages: {
    weeklyUser1: 'Mia, help me organize this week’s project updates. We finished the sign-in flow and notification prototype. The knowledge-base cleanup has not started. We have a team demo on Friday.',
    weeklyAssistant1: 'Let’s separate progress from next steps.\n\nCompleted\nThe sign-in flow and notification prototype are ready to demo. Prepare one complete path for each so you do not have to find entry points during the presentation.\n\nNext up\nThe knowledge-base cleanup has not started. Agree on the document scope and owners this week rather than moving everything at once.\n\nFriday’s demo\nFollow one story: enter the workspace, start a task, then receive a notification. Help the team understand the complete experience first.',
    weeklyUser2: 'We only have 15 minutes. Suggest an agenda and list what we need to do before Friday.',
    weeklyAssistant2: 'Split the 15 minutes into three parts and leave room for discussion.\n\n1. Goal and context · 2 minutes\nExplain what the prototype should validate: starting a task smoothly and understanding its result notification.\n\n2. One complete task · 8 minutes\nYizhou demonstrates sign-in, the workspace, a task, and the notification prototype. Stay on one path and capture questions for later.\n\n3. Feedback and next steps · 5 minutes\nAsk everyone to name one unclear moment. Sort feedback into task blockers and improvements that can wait.\n\nBefore Friday\n• Wednesday: prepare demo data and check the account and entry points.\n• Thursday: rehearse the complete path and keep it within 8 minutes.\n• Before the demo: check notification copy and prepare a static backup.\n\nFor the knowledge base, collect document links and owners first; organize them next week. Shall we turn this checklist into a team announcement?',
    researchUser: 'How do we avoid treating one person’s interview feedback as a universal need?',
    researchAssistant: 'Keep three layers: quote, observation, and hypothesis. For every finding, record how many participants mentioned it and in which task. Then look for counterexamples.\n\nRecord behavior and context before interpreting them. List unverified assumptions separately and use the next interviews to test them before assigning priorities.',
    launchUser: 'We are releasing notifications next week. What should we check before launch?',
    launchAssistant: 'Start with four checks:\n\n• Triggers: distinguish successful, failed, and canceled tasks.\n• Copy: make the event and the next action clear.\n• Destination: ensure each notification opens the relevant task.\n• Recovery: keep task results available in the workspace if delivery fails.\n\nFinally, test the full flow with a fresh account and prepare rollback notes.',
    roadmapUser: 'Help me lay out next quarter’s roadmap. We have a lot of requests piled up.',
    roadmapAssistant: 'Sure — decide the trade-offs first, then order them.\n\nGoals\nPick the two or three things next quarter must deliver and mark everything else “not doing”.\n\nResourcing\nEstimate against the current team size; schedule less rather than overspend capacity.\n\nRisk\nList the parts that depend on other teams separately and give them buffer.',
    incidentUser: 'Help me put together a review of last week’s production incident.',
    incidentAssistant: 'Pin down the facts on a timeline first, then discuss improvements.\n\nTimeline\nFrom the first alert to recovery, write down what happened and who did what.\n\nImpact\nState the affected user range and duration — neither inflated nor minimized.\n\nImprovements\nKeep at most three that have an owner and a date, rather than a wish list.',
    budgetUser: 'This quarter’s budget is nearly used up. Help me reconcile each track.',
    budgetAssistant: 'Reconcile track by track rather than looking only at the total.\n\nBy track\nSum spent and remaining for product, growth, and platform separately.\n\nOutliers\nFlag the items over their expected share, then ask why before judging.\n\nConclusion\nConcentrate the remaining budget on next quarter’s key items instead of spreading it evenly.',
    hiringUser: 'Interview scheduling is a bit messy. Help me standardize the feedback summary.',
    hiringAssistant: 'Agree on the structure first, then summarize.\n\nStructure\nWrite each interview round as conclusion, evidence, and risk — not just a feeling.\n\nConsistency\nDescribe the same competency the same way across interviewers.\n\nSummary\nGive a clear recommendation and flag what still needs verification.',
    knowledgeUser: 'Our documents keep growing. How can we organize them without creating a huge project?',
    knowledgeAssistant: 'Start with the five questions people have asked most in the last two weeks.\n\nFind the relevant documents, add owners and review dates, and build a lightweight index without changing the original links. Do not move every file or design an elaborate taxonomy yet.\n\nObserve whether people find answers faster for one week, then decide whether to expand.',
    quarterlyUser: 'The quarter is almost over. Help me put together the review data for it.',
    quarterlyAssistant: 'Sure — let’s fix the data scope first.\n\nTime range\nUse the natural quarter (Jul–Sep) and note the cut-off date.\n\nBy track\nSummarize effort and output for product, growth, and platform separately rather than mixing them.\n\nTo confirm\nI need your sign-off on the scope before writing back into “release-plan.csv”; I will not treat assumptions as facts.',
    releaseUser: 'The release note changes are a bit scattered. Help me group them by module.',
    releaseAssistant: 'Grouped them into a checklist draft by module:\n\n• Added: notification entry point, task result page\n• Changed: how the composer sends\n• Fixed: fallback when a notification is not delivered\n\nEach entry records an owner and how to verify it. This is a draft and has not been written to any file.',
  },
  responses: {
    first: 'Let’s turn the goal into a draft you can actually use.\n\nStep 1: define the result\nWrite down what the task should produce and who will use it. Make it useful before polishing the format.\n\nStep 2: identify the smallest actions\nSeparate gathering inputs, drafting, and reviewing together. Give each action one clear output instead of combining several goals.\n\nStep 3: schedule a check\nLeave time to verify information, owners, and deadlines. Mark uncertainty rather than making unconfirmed decisions for the team.\n\nThis is a demo suggestion; no external action has been taken. Tell me which part you would like to develop next.',
    second: 'We can make this easier to collaborate on.\n\nGoal\nDescribe the problem in one sentence and add a completion criterion that can be checked.\n\nOwnership\nGive each task one owner. When someone else needs to confirm something, state the question and the expected response date.\n\nCadence\nFinish a small draft, then hold a short review. Keep new ideas on a follow-up list rather than expanding the current task.\n\nTo confirm\nWe still need a specific deadline and the participants. I will not treat assumptions as facts; we can update the plan when you provide them.',
    third: 'Here is a team announcement you can edit:\n\nHi everyone, this week we will hold a short prototype demo focused on task entry points, the workflow, and result feedback.\n\nBefore the demo, please prepare the latest materials for your part and list open questions separately. We will walk through one complete path first, then discuss feedback together.\n\nWe will turn the discussion into action items with an owner and a next review date for each.\n\nThis text has not been sent to anyone. Add the time, participants, and links before using it.',
  },
}
