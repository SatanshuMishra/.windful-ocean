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

local wezterm_background = '#000000'

local function paint_wezterm_background(group)
    local current = vim.api.nvim_get_hl(0, { name = group, link = false })
    vim.api.nvim_set_hl(0, group, vim.tbl_extend('force', current, { bg = wezterm_background }))
end

create_augroup('VisualCustomization', {
    {
        { "ColorScheme" },
        callback = function()
            for _, group in ipairs({ "Normal", "SignColumn", "EndOfBuffer" }) do
                paint_wezterm_background(group)
            end
            vim.api.nvim_set_hl(0, "NormalNC", { link = "Normal" })
            vim.api.nvim_set_hl(0, "LineNr", { fg = "#CCCCCC" })
            vim.api.nvim_set_hl(0, "LineNrAbove", { fg = "#ffffff" })
            vim.api.nvim_set_hl(0, "CursorLineNr", { fg = "#ffffff" })
        end
    },
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
