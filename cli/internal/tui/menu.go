package tui

import (
	"fmt"
	"strings"

	"github.com/atotto/clipboard"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type MenuTab int

const (
	ContextTab MenuTab = iota
	CommandsTab
	HelpTab
)

type MenuState int

const (
	NormalState MenuState = iota
	ProjectSelectState
)

type QuickMenuModel struct {
	active    bool
	activeTab MenuTab
	cursorPos int
	width     int
	height    int
	menuState MenuState

	config           *Config
	currentProject   string
	currentNamespace string
	currentDB        string
	currentStrategy  string
	currentModel     string
	devMode          bool

	projects   []ProjectItem
	databases  []DatabaseItem
	strategies []StrategyItem
	models     []ModelItem
	commands   []CommandItem

	// Map of database name to its strategies
	databaseStrategies map[string][]StrategyItem

	projectCursorPos int

	baseStyle      lipgloss.Style
	focusedStyle   lipgloss.Style
	dimmedStyle    lipgloss.Style
	headerStyle    lipgloss.Style
	hintStyle      lipgloss.Style
	borderStyle    lipgloss.Style
	tabStyle       lipgloss.Style
	activeTabStyle lipgloss.Style
	// Accent colors
	accentColor  lipgloss.Color
	activeColor  lipgloss.Color
	hintDimColor lipgloss.Color

	// metadata
	version string

	// commands expansion state
	showModelsList   bool
	showDatasetsList bool
	// prompts expansion state and data
	Prompts         []PromptItem
	showPromptsList bool
	// Datasets (names) for commands section — provided by chat
	Datasets []string

	// Help entries
	helpItems []HelpItem

	// Health summary cached for Help tab
	RAGHealthSummary string
}

type ProjectItem struct {
	Name      string
	Namespace string
	IsActive  bool
}

type DatabaseItem struct {
	Name     string
	DocCount int
	IsActive bool
}

type StrategyItem struct {
	Name     string
	IsActive bool
}

type ModelItem struct {
	Name        string
	Provider    string
	IsActive    bool
	Description string
}

type CommandItem struct {
	Command     string
	Description string
}

type PromptItem struct {
	Name        string
	Description string
}

type Config struct {
	Name      string
	Namespace string
	Version   string
}

type HelpItem struct {
	Label      string
	Command    string // slash command or hint; empty for non-selectable lines
	NeedsInput bool   // if true, copy template to clipboard rather than run
	Action     string // special actions: ctrl+t, ctrl+k
}

func NewQuickMenuModel(config *Config) QuickMenuModel {
	m := QuickMenuModel{
		active:           false,
		activeTab:        ContextTab,
		cursorPos:        0,
		config:           config,
		currentProject:   config.Name,
		currentNamespace: config.Namespace,
		devMode:          false,
		menuState:        NormalState,
	}

	m.baseStyle = lipgloss.NewStyle()
	m.focusedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("86")).Bold(true)
	m.dimmedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	m.headerStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("86"))
	m.hintStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	m.borderStyle = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("86")).Padding(1, 2)
	// Tabs: pill style (active has background), no underline borders
	m.tabStyle = lipgloss.NewStyle().Padding(0, 2).Foreground(lipgloss.Color("245"))
	m.activeTabStyle = lipgloss.NewStyle().Padding(0, 2).Foreground(lipgloss.Color("#000000")).Background(lipgloss.Color("86")).Bold(true)
	m.accentColor = lipgloss.Color("86")
	m.activeColor = lipgloss.Color("39")
	m.hintDimColor = lipgloss.Color("240")

	if config != nil {
		m.version = config.Version
	}

	m.commands = []CommandItem{
		{Command: "list models", Description: "List available models"},
		{Command: "list datasets", Description: "List available datasets"},
		{Command: "list prompts", Description: "List available prompts"},
	}

	// Initialize with empty slices - will be populated via UpdateData method
	m.databases = []DatabaseItem{}
	m.strategies = []StrategyItem{}
	m.models = []ModelItem{}
	m.projects = []ProjectItem{
		{Name: config.Name, Namespace: config.Namespace, IsActive: true},
	}

	// Build help entries
	m.helpItems = []HelpItem{
		{Label: "/help - Show this help", Command: "/help"},
		{Label: "/mode [dev|project] - Switch mode", Command: "/mode dev", NeedsInput: true},
		{Label: "/model [name] - Switch model (PROJECT mode)", Command: "/model ", NeedsInput: true},
		{Label: "/database [name] - Switch RAG database (PROJECT mode)", Command: "/database ", NeedsInput: true},
		{Label: "/strategy [name] - Switch retrieval strategy (PROJECT mode)", Command: "/strategy ", NeedsInput: true},
		{Label: "/clear - Clear conversation", Command: "/clear"},
		{Label: "/launch designer - Open designer", Command: "/launch designer"},
		{Label: "/menu - Open Quick Menu (you're here already)", Command: "", NeedsInput: false},
		{Label: "/exit - Exit", Command: "/exit"},
		{Label: "", Command: ""},
		{Label: "Hotkeys:", Command: ""},
		{Label: "Ctrl+T - Toggle DEV/PROJECT mode", Action: "ctrl+t"},
		{Label: "Ctrl+K - Cycle models", Action: "ctrl+k"},
		{Label: "Refresh RAG Health", Action: "refresh-health"},
	}

	return m
}

func (m QuickMenuModel) Update(msg tea.Msg) (QuickMenuModel, tea.Cmd) {
	if !m.active {
		switch msg := msg.(type) {
		case tea.WindowSizeMsg:
			m.width = msg.Width
			m.height = msg.Height
		case SwitchModeMsg:
			m.devMode = msg.DevMode
		case SwitchDatabaseMsg:
			m.currentDB = msg.DatabaseName
			for i := range m.databases {
				m.databases[i].IsActive = (m.databases[i].Name == msg.DatabaseName)
			}
			// Update strategies to show only those for the selected database
			m.updateStrategiesForCurrentDatabase()
			// Reset strategy selection to the default for the new database
			if len(m.strategies) > 0 {
				m.currentStrategy = m.strategies[0].Name
				m.strategies[0].IsActive = true
			}
		case SwitchModelMsg:
			m.currentModel = msg.ModelName
			for i := range m.models {
				m.models[i].IsActive = (m.models[i].Name == msg.ModelName)
			}
		case SwitchProjectMsg:
			m.currentProject = msg.ProjectName
			m.currentNamespace = msg.Namespace
			for i := range m.projects {
				m.projects[i].IsActive = (m.projects[i].Name == msg.ProjectName && m.projects[i].Namespace == msg.Namespace)
			}
		case SwitchStrategyMsg:
			m.currentStrategy = msg.StrategyName
			for i := range m.strategies {
				m.strategies[i].IsActive = (m.strategies[i].Name == msg.StrategyName)
			}
		}
		return m, nil
	}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case SwitchModeMsg:
		m.devMode = msg.DevMode
		return m, nil
	case SwitchDatabaseMsg:
		m.currentDB = msg.DatabaseName
		for i := range m.databases {
			m.databases[i].IsActive = (m.databases[i].Name == msg.DatabaseName)
		}
		// Update strategies to show only those for the selected database
		m.updateStrategiesForCurrentDatabase()
		// Reset strategy selection to the default for the new database
		if len(m.strategies) > 0 {
			m.currentStrategy = m.strategies[0].Name
			m.strategies[0].IsActive = true
		}
		return m, nil
	case SwitchModelMsg:
		m.currentModel = msg.ModelName
		for i := range m.models {
			m.models[i].IsActive = (m.models[i].Name == msg.ModelName)
		}
		return m, nil
	case SwitchProjectMsg:
		m.currentProject = msg.ProjectName
		m.currentNamespace = msg.Namespace
		for i := range m.projects {
			m.projects[i].IsActive = (m.projects[i].Name == msg.ProjectName && m.projects[i].Namespace == msg.Namespace)
		}
		return m, nil
	case SwitchStrategyMsg:
		m.currentStrategy = msg.StrategyName
		for i := range m.strategies {
			m.strategies[i].IsActive = (m.strategies[i].Name == msg.StrategyName)
		}
		return m, nil
	case tea.KeyMsg:
		if m.menuState == ProjectSelectState {
			return m.handleProjectSelection(msg)
		}
		switch msg.String() {
		case "esc":
			m.active = false
			return m, nil
		case "ctrl+c":
			return m, tea.Quit
		case "tab":
			m.activeTab = (m.activeTab + 1) % 3
			m.cursorPos = 0
			return m, nil
		case "shift+tab":
			m.activeTab = (m.activeTab - 1 + 3) % 3
			m.cursorPos = 0
			return m, nil
		case "up":
			// Wrap-around navigation
			maxPos := m.getMaxCursorPos()
			if m.cursorPos > 0 {
				m.cursorPos--
			} else {
				m.cursorPos = maxPos
			}
			// Skip /menu line in Help tab
			if m.activeTab == HelpTab && m.cursorPos >= 0 && m.cursorPos < len(m.helpItems) {
				if strings.HasPrefix(m.helpItems[m.cursorPos].Label, "/menu") {
					if m.cursorPos > 0 {
						m.cursorPos--
					} else {
						m.cursorPos = maxPos
					}
				}
			}
			return m, nil
		case "down":
			// Wrap-around navigation
			maxPos := m.getMaxCursorPos()
			if m.cursorPos < maxPos {
				m.cursorPos++
			} else {
				m.cursorPos = 0
			}
			// Skip /menu line in Help tab
			if m.activeTab == HelpTab && m.cursorPos >= 0 && m.cursorPos < len(m.helpItems) {
				if strings.HasPrefix(m.helpItems[m.cursorPos].Label, "/menu") {
					if m.cursorPos < maxPos {
						m.cursorPos++
					} else {
						m.cursorPos = 0
					}
				}
			}
			return m, nil
		case "enter":
			if m.activeTab == HelpTab {
				return m, m.handleHelpSelection()
			}
			return m, m.handleSelectionAndRun()
			// Disallow any other hotkeys from mutating state while menu is open
		}
	}
	return m, nil
}

func (m QuickMenuModel) handleProjectSelection(msg tea.KeyMsg) (QuickMenuModel, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.menuState = NormalState
		return m, nil
	case "up", "k":
		if m.projectCursorPos > 0 {
			m.projectCursorPos--
		} else if len(m.projects) > 0 {
			m.projectCursorPos = len(m.projects) - 1
		}
		return m, nil
	case "down", "j":
		if m.projectCursorPos < len(m.projects)-1 {
			m.projectCursorPos++
		} else if len(m.projects) > 0 {
			m.projectCursorPos = 0
		}
		return m, nil
	case "enter":
		selectedProject := m.projects[m.projectCursorPos]
		m.menuState = NormalState
		return m, switchProjectCmd(selectedProject.Name, selectedProject.Namespace)
	}
	return m, nil
}

func (m QuickMenuModel) getMaxCursorPos() int {
	switch m.activeTab {
	case ContextTab:
		// 0: PROJECT MODE, 1: DEV MODE, 2: Project line,
		// 3..dbs, then strategies, then models
		// Max cursor index: 2 + len(dbs) + len(strategies) + len(models)
		return 2 + len(m.databases) + len(m.strategies) + len(m.models)
	case CommandsTab:
		// Account for expanded sublists under commands
		extra := 0
		if m.showModelsList && len(m.models) > 0 {
			extra += len(m.models)
		}
		if m.showDatasetsList && len(m.Datasets) > 0 { // Changed from m.databases to m.Datasets
			extra += len(m.Datasets)
		}
		if m.showPromptsList && len(m.Prompts) > 0 {
			extra += len(m.Prompts)
		}
		return (len(m.commands) - 1) + extra
	case HelpTab:
		// allow selection of help items (skip non-selectable)
		// Exclude /menu entry from focusable range by returning last index but skipping during movement
		return len(m.helpItems) - 1
	default:
		return 0
	}
}

func (m *QuickMenuModel) handleSelection() tea.Cmd {
	switch m.activeTab {
	case ContextTab:
		if m.cursorPos == 0 {
			// PROJECT MODE row: if currently in DEV, allow switching back to PROJECT
			if m.devMode {
				m.devMode = false
				return switchModeCmd(false)
			}
			return nil
		}
		if m.cursorPos == 1 {
			// Switch to DEV mode when selecting DEV MODE row
			if !m.devMode {
				m.devMode = true
				return switchModeCmd(true)
			}
			return nil
		}
		if m.cursorPos == 2 {
			// Enter project selection state
			m.menuState = ProjectSelectState
			// Initialize cursor to current project
			m.projectCursorPos = m.findCurrentProjectIndex()
			return nil
		}
		// Databases start at cursor index 3
		dbIndex := m.cursorPos - 3
		if dbIndex >= 0 && len(m.databases) > 0 && dbIndex < len(m.databases) {
			selectedDB := m.databases[dbIndex]
			return switchDatabaseCmd(selectedDB.Name)
		}
		// Strategy selection follows databases
		// Strategies start at cursor index 3+len(dbs)
		stratIndex := m.cursorPos - (3 + len(m.databases))
		if stratIndex >= 0 && len(m.strategies) > 0 && stratIndex < len(m.strategies) {
			selected := m.strategies[stratIndex]
			return switchStrategyCmd(selected.Name)
		}
		// Model selection follows strategies
		// Models start at cursor index 3+len(dbs)+len(strategies)
		modelIndex := m.cursorPos - (3 + len(m.databases) + len(m.strategies))
		if modelIndex >= 0 && len(m.models) > 0 && modelIndex < len(m.models) {
			selectedModel := m.models[modelIndex]
			return switchModelCmd(selectedModel.Name)
		}
	case CommandsTab:
		if len(m.commands) > 0 && m.cursorPos < len(m.commands) {
			cmd := m.commands[m.cursorPos].Command
			clipboard.WriteAll(cmd)
			return showToastCmd("Copied: " + cmd)
		}
	}
	return nil
}

func (m *QuickMenuModel) handleSelectionAndRun() tea.Cmd {
	if m.activeTab == CommandsTab {
		// Offsets as we iterate:
		// row 0: list models (toggle)
		// rows 1..N: models if expanded
		// next row: list datasets (toggle) [base index 1 or 1+len(models)]
		// subsequent rows: datasets if expanded
		base := 0

		// Handle row 0 toggle
		if m.cursorPos == base {
			m.showModelsList = !m.showModelsList
			return nil
		}

		// Rows for models
		next := base + 1
		if m.showModelsList {
			if m.cursorPos >= next && m.cursorPos < next+len(m.models) {
				idx := m.cursorPos - next
				selected := m.models[idx]
				return switchModelCmd(selected.Name)
			}
			next += len(m.models)
		}

		// list datasets command lives at 'next'
		if m.cursorPos == next {
			m.showDatasetsList = !m.showDatasetsList
			return nil
		}
		next += 1

		// dataset entries (by database names) for selection of active DB
		if m.showDatasetsList {
			// if datasets slice is empty, synthesize placeholders from databases
			count := len(m.Datasets)
			if count == 0 {
				count = len(m.databases)
			}
			if m.cursorPos >= next && m.cursorPos < next+count {
				// For now selecting a dataset will switch to its database if available
				dIdx := m.cursorPos - next
				if dIdx >= 0 && dIdx < len(m.databases) {
					return switchDatabaseCmd(m.databases[dIdx].Name)
				}
			}
			next += count
		}

		// list prompts command at 'next'
		if m.cursorPos == next {
			m.showPromptsList = !m.showPromptsList
			return nil
		}
		next += 1

		// prompt entries (name/description) - selecting does nothing for now
		if m.showPromptsList {
			if m.cursorPos >= next && m.cursorPos < next+len(m.Prompts) {
				// no-op select; could copy name to clipboard later
				return nil
			}
			next += len(m.Prompts)
		}

		// Remaining commands run as before
		remainingIndex := m.cursorPos - next
		if remainingIndex >= 0 {
			// Map remainingIndex into m.commands slice beyond the first two
			cmdSliceStart := 3
			if cmdSliceStart+remainingIndex < len(m.commands) {
				cmd := m.commands[cmdSliceStart+remainingIndex].Command
				m.active = false
				return executeCommandCmd(cmd)
			}
		}
		return nil
	}
	return m.handleSelection()
}

func (m QuickMenuModel) findCurrentProjectIndex() int {
	for i, proj := range m.projects {
		if proj.IsActive {
			return i
		}
	}
	return 0
}

func (m QuickMenuModel) View() string {
	if !m.active {
		return ""
	}
	menuWidth := m.computeMenuWidth()
	var content strings.Builder
	header := m.headerStyle.Render("🦙 LlamaFarm Quick Menu")
	// Subtle version next to title
	leftHeader := header
	if strings.TrimSpace(m.version) != "" {
		versionText := m.hintStyle.Render(fmt.Sprintf("version: %s", m.version))
		leftHeader = lipgloss.JoinHorizontal(lipgloss.Left, header, " ", versionText)
	}
	closeHint := m.hintStyle.Render("[ESC to close]")
	spaceCount := menuWidth - lipgloss.Width(leftHeader) - lipgloss.Width(closeHint) - 4
	if spaceCount < 0 {
		spaceCount = 0
	}
	headerLine := lipgloss.JoinHorizontal(lipgloss.Left, leftHeader, strings.Repeat(" ", spaceCount), closeHint)
	content.WriteString(headerLine + "\n")
	ruleWidth := menuWidth - 4
	if ruleWidth < 0 {
		ruleWidth = 0
	}
	content.WriteString(strings.Repeat("─", ruleWidth) + "\n\n")
	content.WriteString(m.renderTabBar() + "\n\n")
	switch m.activeTab {
	case ContextTab:
		content.WriteString(m.renderContextTab())
	case CommandsTab:
		content.WriteString(m.renderCommandsTab())
	case HelpTab:
		content.WriteString(m.renderHelpTab())
	}
	content.WriteString("\n" + strings.Repeat("─", ruleWidth) + "\n")
	// Footer boxed styling with fixed inner width to avoid wrap glitches
	innerWidth := menuWidth - 6 // account for outer padding/borders
	if innerWidth < 10 {
		innerWidth = 10
	}
	footerBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(m.accentColor).
		Padding(0, 1).
		Width(innerWidth)
	content.WriteString(footerBox.Render(m.renderFooter()))
	// Make the overlay a consistent height relative to terminal height
	boxStyle := m.borderStyle.Width(menuWidth)
	if m.height > 0 {
		target := int(float64(m.height) * 0.7)
		if target < 18 {
			target = 18
		}
		if target > m.height-2 {
			target = m.height - 2
		}
		if target > 0 {
			boxStyle = boxStyle.Height(target)
		}
	}
	box := boxStyle.Render(content.String())
	return m.positionMenu(box)
}

func (m QuickMenuModel) renderTabBar() string {
	tabs := []string{"Context", "Project Details", "Help"}
	var pieces []string
	sep := lipgloss.NewStyle().Foreground(lipgloss.Color("238")).Render("|")
	for i, tab := range tabs {
		if i > 0 {
			pieces = append(pieces, sep)
		}
		if MenuTab(i) == m.activeTab {
			pieces = append(pieces, m.activeTabStyle.Render(tab))
		} else {
			pieces = append(pieces, m.tabStyle.Render(tab))
		}
	}
	// Left-align to avoid wrapping when the active pill is wider
	return strings.Join(pieces, " ")
}

func (m QuickMenuModel) renderContextTab() string {
	if m.menuState == ProjectSelectState {
		return m.renderProjectSelector()
	}
	var s strings.Builder
	menuWidth := m.computeMenuWidth()
	contentWidth := menuWidth - 4
	if contentWidth < 20 {
		contentWidth = 20
	}
	itemIndex := 0
	// PROJECT MODE line (shows selected state when not in DEV)
	projCursor := "  "
	if m.cursorPos == itemIndex {
		projCursor = "→ "
	}
	projActive := " "
	if !m.devMode {
		projActive = "✓"
	}
	projDesc := m.hintStyle.Render("— Test your project's outputs (validation, QA, results checking)")
	projLine := fmt.Sprintf("%s%s 🤖 PROJECT MODE  %s", projCursor, projActive, projDesc)
	if m.cursorPos == itemIndex {
		// Cursor highlight takes precedence
		projLine = m.focusedStyle.Render(projLine)
	} else if !m.devMode {
		// Visualize currently selected mode even when not focused
		projLine = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(projLine)
	}
	s.WriteString(projLine + "\n")
	itemIndex++
	// DEV MODE line (actionable: pressing Enter switches)
	devCursor := "  "
	if m.cursorPos == itemIndex {
		devCursor = "→ "
	}
	devActive := " "
	if m.devMode {
		devActive = "✓"
	}
	devDesc := m.hintStyle.Render("— Build your LlamaFarm project (setup, configuration, development)")
	devLine := fmt.Sprintf("%s%s 🔧 DEV MODE  %s", devCursor, devActive, devDesc)
	if m.cursorPos == itemIndex {
		devLine = m.focusedStyle.Render(devLine)
	} else if m.devMode {
		// Visualize currently selected mode even when not focused
		devLine = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(devLine)
	}
	s.WriteString(devLine + "\n\n")
	itemIndex++
	projCursor2 := "  "
	if m.cursorPos == itemIndex {
		projCursor2 = "→ "
	}
	currentProjectText := m.currentProject
	if len(m.projects) == 0 {
		currentProjectText = "(none)"
	}
	projectLine := fmt.Sprintf("%sProject:  %s", projCursor2, currentProjectText)
	if len(m.projects) > 1 {
		projectLine += "    [▼]"
	}
	if m.cursorPos == itemIndex {
		projectLine = m.focusedStyle.Render(projectLine)
	}
	s.WriteString(projectLine + "\n")
	nsText := m.currentNamespace
	if nsText == "" {
		nsText = "(none)"
	}
	s.WriteString(fmt.Sprintf("  Namespace: %s\n\n", nsText))
	itemIndex++
	s.WriteString("Database:\n")
	if len(m.databases) == 0 {
		s.WriteString("  (no databases)\n")
	}
	// Compute dynamic name column width to keep counts/status visible
	nameColWidth := contentWidth - 20
	if nameColWidth < 12 {
		nameColWidth = 12
	}
	for _, db := range m.databases {
		cursor := "  "
		if itemIndex == m.cursorPos {
			cursor = "→ "
		}
		active := " "
		if db.IsActive {
			active = "✓"
		}
		status := ""
		if db.IsActive {
			status = " [active]"
		}
		// Highlight active database name in accent color
		name := db.Name
		if db.IsActive {
			name = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(name)
		}
		line := fmt.Sprintf("%s%s %-*s (%d docs)%s", cursor, active, nameColWidth, name, db.DocCount, status)
		if itemIndex == m.cursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
		itemIndex++
	}
	s.WriteString("\n")
	s.WriteString("Retrieval Strategy:\n")
	if len(m.strategies) == 0 {
		s.WriteString("  (no strategies)\n")
	}
	for idx, strategy := range m.strategies {
		cursor := "  "
		// Strategies start at cursor index 3 + len(databases)
		stratIndex := 3 + len(m.databases) + idx
		if stratIndex == m.cursorPos {
			cursor = "→ "
		}
		active := " "
		if strategy.IsActive {
			active = "✓"
		}
		name := strategy.Name
		if strategy.IsActive {
			name = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(name)
		}
		line := fmt.Sprintf("%s%s %s", cursor, active, name)
		if strategy.IsActive && stratIndex != m.cursorPos {
			line = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(line)
		}
		if stratIndex == m.cursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}

	// Inference model selection follows strategies
	s.WriteString("\n")
	s.WriteString("Inference Model:\n")
	for i, model := range m.models {
		cursor := "  "
		modelIndex := 3 + len(m.databases) + len(m.strategies) + i
		if modelIndex == m.cursorPos {
			cursor = "→ "
		}
		active := " "
		status := ""
		if model.IsActive {
			active = "✓"
			status = " [active]"
		}
		name := model.Name
		if model.IsActive {
			name = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(name)
		}
		line := fmt.Sprintf("%s%s %s (%s)%s", cursor, active, name, model.Provider, status)
		if modelIndex == m.cursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}

	// Embedding model info (non-selectable)
	s.WriteString("\n")
	s.WriteString("Embedding Model:\n")
	embLine := lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render("  ✓ nomic-embed-text")
	s.WriteString(embLine + "\n")
	return s.String()
}

func (m QuickMenuModel) renderProjectSelector() string {
	var s strings.Builder
	s.WriteString("Select Project:\n\n")
	for i, proj := range m.projects {
		cursor := "  "
		if i == m.projectCursorPos {
			cursor = "→ "
		}
		active := " "
		if proj.IsActive {
			active = "✓"
		}
		status := ""
		if proj.IsActive {
			status = " [current]"
		}
		line := fmt.Sprintf("%s%s %s/%s%s", cursor, active, proj.Name, proj.Namespace, status)
		if i == m.projectCursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}
	s.WriteString("\n")
	s.WriteString(m.hintStyle.Render("[Press Enter to switch, Esc to cancel]"))
	return s.String()
}

func (m QuickMenuModel) renderCommandsTab() string {
	var s strings.Builder
	hint := m.hintStyle.Render("Project Details (Enter: run / toggle)")
	s.WriteString(hint + "\n")
	menuWidth := m.computeMenuWidth()
	contentWidth := menuWidth - 4
	if contentWidth < 24 {
		contentWidth = 24
	}
	// Dynamic column widths
	commandCol := contentWidth / 3
	if commandCol < 16 {
		commandCol = 16
	}
	if commandCol > 28 {
		commandCol = 28
	}
	descWidth := contentWidth - commandCol - 3 // cursor + space
	if descWidth < 10 {
		descWidth = 10
	}
	for i, cmd := range m.commands {
		cursor := "  "
		// Compute actual row index considering expansion for rows below the first item
		rowIndex := i
		if i > 0 && m.showModelsList {
			rowIndex += len(m.models)
		}
		if i > 1 && m.showDatasetsList {
			rowIndex += len(m.Datasets) // Changed from m.databases to m.Datasets
		}
		if i > 2 && m.showPromptsList {
			rowIndex += len(m.Prompts)
		}
		if rowIndex == m.cursorPos {
			cursor = "→ "
		}
		cmdText := cmd.Command
		if rowIndex == m.cursorPos {
			cmdText = m.focusedStyle.Render(cmdText)
		} else {
			cmdText = lipgloss.NewStyle().Foreground(lipgloss.Color("86")).Render(cmdText)
		}
		descLines := wrapText(cmd.Description, descWidth)
		// First line with columns
		// Add toggle indicator to the first command (list models)
		indicator := ""
		if i == 0 {
			if m.showModelsList {
				indicator = "[▼] "
			} else {
				indicator = "[▶] "
			}
		} else if i == 1 { // list datasets indicator
			if m.showDatasetsList {
				indicator = "[▼] "
			} else {
				indicator = "[▶] "
			}
		} else if i == 2 { // list prompts indicator
			if m.showPromptsList {
				indicator = "[▼] "
			} else {
				indicator = "[▶] "
			}
		}
		s.WriteString(fmt.Sprintf("%s%-*s %s%s\n", cursor, commandCol, indicator+cmdText, "", descLines[0]))
		// Continuation lines aligned under description
		indent := strings.Repeat(" ", 2+commandCol+1) // cursor + command col + space
		for j := 1; j < len(descLines); j++ {
			s.WriteString(indent + descLines[j] + "\n")
		}
		// If this is the first command and expanded, show models list underneath
		if i == 0 && m.showModelsList {
			for mi, model := range m.models {
				mRowIndex := 1 + mi // rows after first command
				mCursor := "  "
				if m.cursorPos == mRowIndex {
					mCursor = "→ "
				}
				active := " "
				if model.IsActive {
					active = "✓"
				}
				// Primary line with model name/provider
				line := fmt.Sprintf("%s    %s %s (%s)", mCursor, active, model.Name, model.Provider)
				if m.cursorPos == mRowIndex {
					line = m.focusedStyle.Render(line)
				} else if model.IsActive {
					line = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(line)
				}
				s.WriteString(line + "\n")
				// Optional description, indented beneath
				if strings.TrimSpace(model.Description) != "" {
					desc := wrapText(model.Description, contentWidth-6)
					for _, d := range desc {
						s.WriteString("      " + m.hintStyle.Render(d) + "\n")
					}
				}
			}
		}
		// If this is the second command and expanded, show datasets list underneath
		if i == 1 && m.showDatasetsList {
			baseRow := 2
			if m.showModelsList {
				baseRow += len(m.models)
			}
			// prefer datasets list; fall back to databases names
			count := len(m.Datasets)
			if count == 0 {
				count = len(m.databases)
			}
			for di := 0; di < count; di++ {
				dRowIndex := baseRow + di
				dCursor := "  "
				if m.cursorPos == dRowIndex {
					dCursor = "→ "
				}
				name := ""
				dbName := ""
				strat := ""
				files := ""
				if len(m.Datasets) > 0 {
					name = m.Datasets[di]
				} else if di < len(m.databases) {
					name = m.databases[di].Name
					dbName = name
				}
				// Build detail string if we can infer database row
				if dbName == "" && di < len(m.databases) {
					dbName = m.databases[di].Name
				}
				if di < len(m.strategies) {
					strat = m.strategies[di].Name
				}
				detail := ""
				if dbName != "" || strat != "" || files != "" {
					parts := []string{}
					if dbName != "" {
						parts = append(parts, fmt.Sprintf("db: %s", dbName))
					}
					if strat != "" {
						parts = append(parts, fmt.Sprintf("strategy: %s", strat))
					}
					if files != "" {
						parts = append(parts, files)
					}
					detail = "  " + m.hintStyle.Render(strings.Join(parts, "  |  "))
				}
				line := fmt.Sprintf("%s  %s", dCursor, name)
				if m.cursorPos == dRowIndex {
					line = m.focusedStyle.Render(line)
				}
				s.WriteString(line + "\n")
				if detail != "" {
					s.WriteString("      " + detail + "\n")
				}
			}
		}
		// If this is the third command and expanded, show prompts list underneath
		if i == 2 && m.showPromptsList {
			baseRow := 3
			if m.showModelsList {
				baseRow += len(m.models)
			}
			if m.showDatasetsList {
				baseRow += len(m.databases)
			}
			for pi, pr := range m.Prompts {
				pRowIndex := baseRow + pi
				pCursor := "  "
				if m.cursorPos == pRowIndex {
					pCursor = "→ "
				}
				line := fmt.Sprintf("%s  %s", pCursor, pr.Name)
				if m.cursorPos == pRowIndex {
					line = m.focusedStyle.Render(line)
				}
				s.WriteString(line + "\n")
				if strings.TrimSpace(pr.Description) != "" {
					for _, d := range wrapText(pr.Description, contentWidth-6) {
						s.WriteString("      " + m.hintStyle.Render(d) + "\n")
					}
				}
			}
		}
	}
	return s.String()
}

func (m QuickMenuModel) renderConfigTab() string {
	var s strings.Builder
	s.WriteString("Inference Model:\n")
	for i, model := range m.models {
		cursor := "  "
		if i == m.cursorPos {
			cursor = "→ "
		}
		active := " "
		if model.IsActive {
			active = "✓"
		}
		line := fmt.Sprintf("%s%s %s (%s)", cursor, active, model.Name, model.Provider)
		if i == m.cursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}
	s.WriteString("\n")
	s.WriteString("Embedding Model:\n")
	// Show embedding model as selected styling to match inference model section
	itemIndex := len(m.models) // embedding row index
	embCursor := "  "
	if m.cursorPos == itemIndex { // allow focus on this informational row
		embCursor = "→ "
	}
	embLine := fmt.Sprintf("%s✓ nomic-embed-text", embCursor)
	if m.cursorPos == itemIndex {
		embLine = m.focusedStyle.Render(embLine)
	} else {
		embLine = lipgloss.NewStyle().Foreground(m.activeColor).Bold(true).Render(embLine)
	}
	s.WriteString(embLine + "\n")
	return s.String()
}

func (m QuickMenuModel) renderFooter() string {
	var shortcuts []string
	if m.menuState == ProjectSelectState {
		shortcuts = []string{"↑↓: select", "Enter: switch", "Esc: cancel"}
	} else {
		switch m.activeTab {
		case CommandsTab:
			shortcuts = []string{"↑↓: scroll", "Enter: run/toggle", "Tab: next", "ESC: close"}
		case HelpTab:
			shortcuts = []string{"Tab: sections", "ESC: close"}
		default:
			shortcuts = []string{"↑↓: navigate", "Enter: select", "Tab: sections", "ESC: close"}
		}
	}
	return m.hintStyle.Render(strings.Join(shortcuts, "  "))
}

func (m QuickMenuModel) renderHelpTab() string {
	var s strings.Builder
	s.WriteString("Shortcuts & Commands:\n\n")
	// Render all help items except the last (which is Refresh)
	for idx := 0; idx < len(m.helpItems)-1; idx++ {
		item := m.helpItems[idx]
		cursor := "  "
		// Skip making /menu line focusable
		isMenuLine := strings.HasPrefix(item.Label, "/menu")
		if idx == m.cursorPos && !isMenuLine {
			cursor = "→ "
		}
		line := cursor + item.Label
		if idx == m.cursorPos && !isMenuLine {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}
	s.WriteString("\n")
	// Now show RAG health block
	s.WriteString("RAG Health:\n")
	summary := m.RAGHealthSummary
	if strings.TrimSpace(summary) == "" {
		summary = "(press Refresh to load)"
	}
	s.WriteString("  ")
	s.WriteString(m.hintStyle.Render(summary))
	s.WriteString("\n")

	// Finally, render the last item (Refresh) so it appears below health
	if len(m.helpItems) > 0 {
		lastIdx := len(m.helpItems) - 1
		item := m.helpItems[lastIdx]
		cursor := "  "
		if lastIdx == m.cursorPos {
			cursor = "→ "
		}
		line := cursor + item.Label
		if lastIdx == m.cursorPos {
			line = m.focusedStyle.Render(line)
		}
		s.WriteString(line + "\n")
	}
	return s.String()
}

// Help selection behavior: copy or emit actions; actual execution handled by parent
func (m *QuickMenuModel) handleHelpSelection() tea.Cmd {
	if m.cursorPos < 0 || m.cursorPos >= len(m.helpItems) {
		return nil
	}
	item := m.helpItems[m.cursorPos]
	if item.Label == "" || (item.Command == "" && item.Action == "") {
		return nil
	}
	if item.Action == "ctrl+t" {
		// toggle mode without closing
		return switchModeCmd(!m.devMode)
	}
	if item.Action == "ctrl+k" {
		// Ask parent to cycle model (project mode only). Keep menu open.
		return cycleModelCmd()
	}
	if item.Action == "refresh-health" {
		return showToastCmd("Refreshing health...")
	}
	if item.NeedsInput {
		// Ensure correct mode and insert template, then close
		m.active = false
		project := isProjectModeCommand(item.Command)
		return tea.Batch(
			insertChatInputCmd(item.Command, !project, project, false),
			showToastCmd("Inserted template in chat; edit and press Enter"),
		)
	}
	// Otherwise, insert and auto-send, then close
	m.active = false
	project := isProjectModeCommand(item.Command)
	return tea.Batch(
		insertChatInputCmd(item.Command, !project, project, true),
		showToastCmd("Running command..."),
	)
}

func (m QuickMenuModel) positionMenu(content string) string {
	contentLines := strings.Split(content, "\n")
	contentHeight := len(contentLines)
	contentWidth := 0
	for _, line := range contentLines {
		w := lipgloss.Width(line)
		if w > contentWidth {
			contentWidth = w
		}
	}
	// When height is zero, render without vertical padding (above input)
	topPadding := 0
	if m.height > 0 {
		topPadding = (m.height - contentHeight) / 2
		if topPadding < 0 {
			topPadding = 0
		}
	}
	leftPadding := (m.width - contentWidth) / 2
	if leftPadding < 0 {
		leftPadding = 0
	}
	var result strings.Builder
	for i := 0; i < topPadding; i++ {
		result.WriteString("\n")
	}
	for _, line := range contentLines {
		result.WriteString(strings.Repeat(" ", leftPadding))
		result.WriteString(line)
		result.WriteString("\n")
	}
	return result.String()
}

func wrapText(text string, width int) []string {
	if len(text) <= width {
		return []string{text}
	}
	var lines []string
	words := strings.Fields(text)
	currentLine := ""
	for _, word := range words {
		if len(currentLine)+len(word)+1 <= width {
			if currentLine == "" {
				currentLine = word
			} else {
				currentLine += " " + word
			}
		} else {
			if currentLine != "" {
				lines = append(lines, currentLine)
			}
			currentLine = word
		}
	}
	if currentLine != "" {
		lines = append(lines, currentLine)
	}
	return lines
}

// computeMenuWidth derives a responsive menu width from the terminal width.
// It keeps reasonable margins on small terminals and expands on wider ones,
// while capping to avoid overly long lines.
func (m QuickMenuModel) computeMenuWidth() int {
	// Base available width with a small margin
	available := m.width - 4
	if available < 20 {
		available = m.width // fall back to full width if extremely narrow
	}
	// Target around 80% of terminal width
	target := int(float64(m.width) * 0.8)
	if target < 40 {
		target = available
	}
	// Clamp between sensible min/max and the available width
	if target > available {
		target = available
	}
	if target < 44 {
		target = available
		if target < 30 {
			target = 30
		}
	}
	if target > 100 {
		target = 100
	}
	return target
}

type SwitchModeMsg struct{ DevMode bool }

func switchModeCmd(devMode bool) tea.Cmd {
	return func() tea.Msg { return SwitchModeMsg{DevMode: devMode} }
}

type SwitchProjectMsg struct{ ProjectName, Namespace string }

func switchProjectCmd(projectName, namespace string) tea.Cmd {
	return func() tea.Msg { return SwitchProjectMsg{ProjectName: projectName, Namespace: namespace} }
}

type SwitchDatabaseMsg struct{ DatabaseName string }

func switchDatabaseCmd(dbName string) tea.Cmd {
	return func() tea.Msg { return SwitchDatabaseMsg{DatabaseName: dbName} }
}

type SwitchModelMsg struct{ ModelName string }

func switchModelCmd(modelName string) tea.Cmd {
	return func() tea.Msg { return SwitchModelMsg{ModelName: modelName} }
}

type ExecuteCommandMsg struct{ Command string }

func executeCommandCmd(command string) tea.Cmd {
	return func() tea.Msg { return ExecuteCommandMsg{Command: command} }
}

type ShowToastMsg struct{ Message string }

func showToastCmd(message string) tea.Cmd {
	return func() tea.Msg { return ShowToastMsg{Message: message} }
}

type SwitchStrategyMsg struct{ StrategyName string }

func switchStrategyCmd(name string) tea.Cmd {
	return func() tea.Msg { return SwitchStrategyMsg{StrategyName: name} }
}

// Request to cycle model (PROJECT mode only)
type CycleModelMsg struct{}

func cycleModelCmd() tea.Cmd { return func() tea.Msg { return CycleModelMsg{} } }

// InsertChatInputMsg requests inserting text into chat input (optionally switch to dev and auto-send)
type InsertChatInputMsg struct {
	Text          string
	EnsureDev     bool
	EnsureProject bool
	AutoSend      bool
}

func insertChatInputCmd(text string, ensureDev bool, ensureProject bool, autoSend bool) tea.Cmd {
	return func() tea.Msg {
		return InsertChatInputMsg{Text: text, EnsureDev: ensureDev, EnsureProject: ensureProject, AutoSend: autoSend}
	}
}

func isProjectModeCommand(cmd string) bool {
	c := strings.TrimSpace(strings.ToLower(cmd))
	return strings.HasPrefix(c, "/model") || strings.HasPrefix(c, "/database") || strings.HasPrefix(c, "/strategy")
}

func (m *QuickMenuModel) Toggle() {
	m.active = !m.active
	if m.active {
		m.activeTab = ContextTab
		m.cursorPos = 0
		m.menuState = NormalState
	}
}
func (m *QuickMenuModel) Open() {
	m.active = true
	m.activeTab = ContextTab
	m.cursorPos = 0
	m.menuState = NormalState
}
func (m *QuickMenuModel) Close()        { m.active = false; m.menuState = NormalState }
func (m QuickMenuModel) IsActive() bool { return m.active }

// UpdateMenuDataMsg is sent when menu data needs to be refreshed from configuration
type UpdateMenuDataMsg struct {
	Models     []ModelItem
	Databases  []DatabaseItem
	Strategies []StrategyItem
}

// SetData updates the menu with real configuration data
func (m *QuickMenuModel) SetData(models []ModelItem, databases []DatabaseItem, databaseStrategies map[string][]StrategyItem, currentModel, currentDB, currentStrategy string) {
	m.models = models
	m.databases = databases
	m.databaseStrategies = databaseStrategies
	m.currentModel = currentModel
	m.currentDB = currentDB
	m.currentStrategy = currentStrategy

	// Update strategies to show only those for the current database
	m.updateStrategiesForCurrentDatabase()
}

// updateStrategiesForCurrentDatabase updates the strategies slice to only show strategies for the current database
func (m *QuickMenuModel) updateStrategiesForCurrentDatabase() {
	if m.databaseStrategies != nil && m.currentDB != "" {
		if strategies, ok := m.databaseStrategies[m.currentDB]; ok {
			m.strategies = strategies
		} else {
			m.strategies = []StrategyItem{}
		}
	} else {
		m.strategies = []StrategyItem{}
	}
}
