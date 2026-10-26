# Apple platforms: iOS, iPadOS and macOS

Apply these rules on top of reference/standard.md when building for iOS, iPadOS or macOS. Each rule names the Sources entries it comes from.

## Targets

- On iOS and iPadOS, size a control at 44x44 pt by default and never below 28x28 pt. (Source 1)
- On macOS, size a control at 28x28 pt by default and never below 20x20 pt. (Source 1)
- On touch, give every button a hit region of at least 44x44 pt. (Source 2)
- Leave about 12 pt of padding around a bezelled element and about 24 pt around an unbezelled one. (Sources 1, 2)

## Contrast and type

- Give text up to 17 pt a contrast ratio of at least 4.5:1, and text at 18 pt or bold text at least 3:1. (Source 1)
- Offer a higher-contrast colour scheme when Increase Contrast is on. (Source 1)
- Check contrast in both the light and the dark appearance. (Source 1)
- Set body text at 17 pt on iOS and iPadOS, never below 11 pt. (Source 3)
- Set body text at 13 pt on macOS, never below 10 pt. (Source 3)
- Avoid the Ultralight, Thin and Light weights. (Source 3)

## Destructive actions

- Give a destructive button the destructive role, shown in system red, and never the primary role. (Source 2)
- Show no alert for a common action that can be undone, even a destructive one; offer undo instead. (Sources 4, 6)
- For an uncommon action that cannot be undone, show an alert with a Cancel button, and never make the destructive button the default. (Source 4)
- On iOS and iPadOS, offer the choices about an intentional action in an action sheet, with destructive buttons at its top and Cancel at its bottom. (Source 5)

## Unavailable actions

- Show an unavailable item dimmed and make it unresponsive. (Source 7)
- Keep a menu available even when every item in it is unavailable. (Source 7)

## Progress

- Prefer a determinate progress indicator. (Source 8)
- Switch an indeterminate indicator to a determinate one as soon as the amount of work is known. (Source 8)
- Keep the indicator moving. (Source 8)
- Never switch an indicator between the circular and the bar style. (Source 8)
- Add a description only when it gives context, never a vague label such as loading, and never label a spinner. (Source 8)
- On macOS, prefer a spinner for a background operation. (Source 8)

## Over media

- Over bright content, add a dark dimming layer of about 35% opacity behind text and controls. (Sources 9, 10)
- Use the regular material where background content could hurt legibility, and vibrant colours on materials. (Source 9)
- Keep overlays on video deferential and translucent. (Source 10)

## Placement

- Put the default button on the trailing side of a row of buttons, or at the top of a stack, and Cancel on the leading side or at the bottom. (Source 4)
- Keep controls legible above scrolling content with a scroll edge effect. (Source 11)

## Sources

1. https://developer.apple.com/design/human-interface-guidelines/accessibility
2. https://developer.apple.com/design/human-interface-guidelines/buttons
3. https://developer.apple.com/design/human-interface-guidelines/typography
4. https://developer.apple.com/design/human-interface-guidelines/alerts
5. https://developer.apple.com/design/human-interface-guidelines/action-sheets
6. https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
7. https://developer.apple.com/design/human-interface-guidelines/menus
8. https://developer.apple.com/design/human-interface-guidelines/progress-indicators
9. https://developer.apple.com/design/human-interface-guidelines/materials
10. https://developer.apple.com/design/human-interface-guidelines/playing-video
11. https://developer.apple.com/design/human-interface-guidelines/layout
