# Windows

Load this reference when building for Windows. Each rule names the Sources entries it comes from.

## Targets

- Make every touch target 7.5 mm square, which is 40x40 pixels at 1.0x scaling on a 135 PPI display. (Source 1)
- Give high-risk targets more padding and place them further from the edge. (Source 1)

## Contrast and type

- Give text a contrast ratio of at least 4.5:1. (Source 2)
- Text in inactive UI is exempt. (Source 2)

## Destructive actions

- Confirm a destructive action in a dialog only where loss is possible. (Source 3)
- Give every dialog at least one safe action button. (Source 3)
- Make the close button the safe, nondestructive action and place it rightmost. (Source 3)
- Make the affirmation button the PrimaryButton, on the left. (Source 3)
- In a destructive confirmation, put the destructive action in PrimaryButton without accent styling and keep DefaultButton on the Close button. (Source 4)
- Set no default button by default. (Source 4)
- Never use a dialog for an error tied to one place on the page; show it inline. (Source 3)

## Unavailable actions

- Treat a disabled button as not interactive. (Source 5)
- Show a tooltip that says what is unavailable and why. (Source 5)

## Progress

- Use a determinate bar when the duration is known. (Source 6)
- Use an indeterminate bar for unknown work that does not block. (Source 6)
- Use an indeterminate ring only for work that blocks interaction. (Source 6)
- Never make a ring smaller than 20x20 epx. (Source 6)
- Do not put a progress indicator on each item of a virtualized list. (Source 6)

## Over media

No platform rule; the standard's default applies.

## Placement

- Use one primary button per layout, for the most important action. (Source 5)
- Order CommandBar commands by importance so the most important stay visible. (Source 7)
- Show at most 4 primary commands at 320 epx and put the rest in the overflow menu. (Source 7)
- Place Accept, Yes and OK left of Reject, No and Cancel. (Source 5)
- Put command bars at the bottom on small handheld screens and near the top of the window on larger ones. (Source 7)
- Avoid sticky command bars. (Source 7)

## Sources

1. https://learn.microsoft.com/en-us/windows/apps/design/input/guidelines-for-targeting
2. https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessible-text-requirements
3. https://learn.microsoft.com/en-us/windows/apps/design/controls/dialogs-and-flyouts/dialogs
4. https://fluent2.microsoft.design/components/web/react/core/dialog/usage
5. https://fluent2.microsoft.design/components/web/react/core/button/usage
6. https://learn.microsoft.com/en-us/windows/apps/design/controls/progress-controls
7. https://learn.microsoft.com/en-us/windows/apps/design/controls/command-bar
