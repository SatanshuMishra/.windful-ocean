-- ============================================================================
--                   SATANSHU'S NEOVIM AUTOCOMMANDS
-- ============================================================================

-- AUTOCOMMAND CREATION HELPER
local function create_augroup(name, commands)
    vim.api.nvim_create_augroup(name, { clear = true })
    for _, cmd in ipairs(commands) do
        vim.api.nvim_create_autocmd(cmd[1], {
            group = name,
            pattern = cmd.pattern,
            callback = cmd.callback,
            command = cmd.command,
        })
    end
end

-- ============================================================================
--                            AUTOCOMMAND GROUPS
-- ============================================================================

-- VISUAL CUSTOMIZATION ON STARTUP
create_augroup('VisualCustomization', {
    {
        { "VimEnter" },
        callback = function()
            -- CUSTOM LINE NUMBER COLORS
            vim.api.nvim_set_hl(0, "LineNr", { bg = "none", fg = "#ffffff" })
            vim.api.nvim_set_hl(0, "LineNrAbove", { bg = "none", fg = "#ffffff" })
            vim.api.nvim_set_hl(0, "CursorLineNr", { bg = "none", fg = "#ffffff" })
            vim.api.nvim_set_hl(0, "EndOfBuffer", { bg = "none" })
            vim.api.nvim_set_hl(0, "NormalNC", { link = "Normal" })
        end
    },
    {
        { "VimEnter" },
        command = "highlight Normal guibg=NONE ctermbg=NONE"
    },
    {
        { "VimEnter" },
        command = "highlight SignColumn guibg=NONE ctermbg=NONE"
    },
    {
        { "VimEnter" },
        command = "highlight LineNr guifg=#CCCCCC"
    }
})

-- TERMINAL TITLE UPDATES FOR WEZTERM
create_augroup('TerminalTitle', {
    {
        { "VimLeave" },
        command = "silent !wezterm cli set-tab-title $(basename \"$PWD\")"
    },
    {
        { "BufEnter" },
        pattern = "*.*",
        callback = function()
            local path_segments = {}
            for segment in string.gmatch(vim.api.nvim_buf_get_name(0), "[^/]+") do
                table.insert(path_segments, segment)
            end
            if #path_segments >= 2 then
                local display_path = "/" .. path_segments[#path_segments - 1] .. "/" .. path_segments[#path_segments]
                vim.fn.system("wezterm cli set-tab-title " .. vim.fn.shellescape(display_path))
            end
        end
    }
})

-- SQL FILETYPE CUSTOMIZATION
create_augroup('SqlCustomization', {
    {
        { "BufRead", "BufNewFile" },
        pattern = { "*.sql" },
        callback = function()
            vim.bo.filetype = "sql"
            vim.opt_local.commentstring = "-- %s"
        end
    }
})

-- FORMAT ON SAVE
create_augroup('FormatOnSave', {
    {
        { "BufWritePre" },
        pattern = "*",
        callback = function()
            -- ONLY FORMAT IF LSP CLIENT IS ATTACHED
            if next(vim.lsp.get_clients({ bufnr = 0 })) then
                vim.lsp.buf.format({ async = false })
            end
        end
    }
})