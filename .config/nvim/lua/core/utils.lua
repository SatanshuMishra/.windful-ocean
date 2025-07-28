-- ============================================================================
--                   SATANSHU'S NEOVIM UTILITY FUNCTIONS
-- ============================================================================

local M = {}

-- ============================================================================
--                           GENERAL UTILITIES
-- ============================================================================

-- STRING SPLITTING UTILITY FOR GENERAL USE
function M.split_string(input_string, pattern)
    local result_table = {}
    local formatted_pattern = "(.-)" .. pattern
    local last_end = 1
    local start_pos, end_pos, capture = input_string:find(formatted_pattern, 1)
    
    while start_pos do
        if start_pos ~= 1 or capture ~= "" then
            table.insert(result_table, capture)
        end
        last_end = end_pos + 1
        start_pos, end_pos, capture = input_string:find(formatted_pattern, last_end)
    end
    
    if last_end <= #input_string then
        capture = input_string:sub(last_end)
        table.insert(result_table, capture)
    end
    
    return result_table
end

-- FIND GIT ROOT DIRECTORY WITH IMPROVED PATH HANDLING
function M.find_git_root()
    local current_file = vim.api.nvim_buf_get_name(0)
    local current_dir = current_file == "" and vim.fn.getcwd() or vim.fn.fnamemodify(current_file, ":h")
    
    local escaped_path = vim.fn.shellescape(current_dir)
    local git_cmd = string.format("git -C %s rev-parse --show-toplevel", escaped_path)
    local git_root = vim.fn.system(git_cmd):gsub("\n", "")
    
    if vim.v.shell_error ~= 0 then
        print("NOT A GIT REPOSITORY. SEARCHING IN CURRENT WORKING DIRECTORY")
        return vim.fn.getcwd()
    end
    
    return git_root
end

-- ============================================================================
--                         DISCORD PRESENCE MODULE
-- ============================================================================

M.DiscordPresence = {}

-- CONFIGURATION FOR PROJECTS WITH CUSTOM PRESENCE
M.DiscordPresence.projects = {
    {
        path = os.getenv("NVIM_HIDDEN_PROJECT_PATH") or "/default/hidden/path",
        reading_message = "📖 Reading [CLASSIFIED]",
        editing_message = "✏️ Editing [CLASSIFIED]", 
        explorer_message = "📁 Browsing [CLASSIFIED]",
        workspace_message = "🔒 Working on Classified Project"
    }
}

-- GET TMUX SESSION INFORMATION
function M.DiscordPresence.get_tmux_info()
    local tmux_session = os.getenv("TMUX")
    if tmux_session then
        local session_name = vim.fn.system("tmux display-message -p '#S'"):gsub("\n", "")
        local window_name = vim.fn.system("tmux display-message -p '#W'"):gsub("\n", "")
        return session_name, window_name
    end
    return nil, nil
end

-- CHECK IF CURRENT DIRECTORY MATCHES A CLASSIFIED PROJECT
function M.DiscordPresence.get_matching_project()
    local cwd = vim.fn.getcwd()
    for _, project in ipairs(M.DiscordPresence.projects) do
        if cwd == project.path or string.match(cwd, "^" .. vim.pesc(project.path) .. "/") then
            return project
        end
    end
    return nil
end

-- GENERATE READING TEXT WITH TMUX CONTEXT
function M.DiscordPresence.get_reading_text(filename)
    local project = M.DiscordPresence.get_matching_project()
    local session, window = M.DiscordPresence.get_tmux_info()
    
    if project then
        if session then
            return string.format("📖 [%s] %s", session, project.reading_message:gsub("📖 ", ""))
        end
        return project.reading_message
    else
        return string.format("🚧 %s\nReading `%s`.", vim.fn.fnamemodify(vim.fn.getcwd(), ":t"), filename)
    end
end

-- GENERATE EDITING TEXT WITH TMUX CONTEXT
function M.DiscordPresence.get_editing_text(filename)
    local project = M.DiscordPresence.get_matching_project()
    local session, window = M.DiscordPresence.get_tmux_info()
    
    if project then
        if session then
            return string.format("✏️ [%s] %s", session, project.editing_message:gsub("✏️ ", ""))
        end
        return project.editing_message
    else
        return string.format("🚧 %s\nEditing `%s`.", vim.fn.fnamemodify(vim.fn.getcwd(), ":t"), filename)
    end
end

-- GENERATE EXPLORER TEXT WITH TMUX CONTEXT
function M.DiscordPresence.get_explorer_text(explorer_name)
    local project = M.DiscordPresence.get_matching_project()
    local session, window = M.DiscordPresence.get_tmux_info()
    
    if project then
        if session then
            return string.format("📁 [%s] %s", session, project.explorer_message:gsub("📁 ", ""))
        end
        return project.explorer_message
    else
        return string.format("🚧 %s\nBrowsing files.", vim.fn.fnamemodify(vim.fn.getcwd(), ":t"))
    end
end

-- GENERATE WORKSPACE TEXT WITH TMUX CONTEXT
function M.DiscordPresence.get_workspace_text(project_name)
    local project = M.DiscordPresence.get_matching_project()
    local session, window = M.DiscordPresence.get_tmux_info()
    
    if project then
        if session then
            return string.format("💼 [%s] %s", session, project.workspace_message:gsub("🔒 ", ""))
        end
        return project.workspace_message
    else
        local default_project = vim.fn.fnamemodify(vim.fn.getcwd(), ":t")
        project_name = project_name or default_project
        return string.format("🚧 %s\nIn workspace.", project_name)
    end
end

return M