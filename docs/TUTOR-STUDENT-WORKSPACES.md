# Tutor and student workspaces

The signed-in hub reads `/learning/workspace` to select the tutor or student right-hand rail. Roles come from canonical database records; user-editable auth metadata is not used. Super Admin keeps priority. Dual-role users can switch workspaces. Household child mode and institutional workspaces retain their existing separate access paths.

The native hub panels show existing dashboard lessons, active roster links, tutor accruals, personal SetLists and recorded cross-app mastery. Progress explains the existing five-correct-attempts/two-calendar-days rule and displays earned milestones. Tutors without a learner profile see teaching-activity counts instead of an impossible learner-onboarding prompt. Lesson attendance is never presented as vocabulary mastery, and private student mastery is not exposed to a tutor through this API.

Detailed booking, profile, classroom, AuthorBoard and payment actions open their existing authorised AlongSide page in a new tab using the existing one-time session pass. Long-lived bearer tokens stay out of URLs and new tabs. This avoids cross-site iframe cookie failures without proxying arbitrary authenticated actions. The hub panels remain in the original tab.

The backend extracts the existing dashboard loaders so booking windows and earnings calculations are shared with the original AlongSide pages. The workspace endpoints are read-only, use verified identity, ignore supplied person IDs/emails, reject absent or suspended tutor roles, do not mint session cookies, and return no-store responses. Payer identity and student account statements are omitted.

Run `npm test` and `CHROME_PATH=/usr/bin/chromium npm run test:smoke`. Workspace browser fixtures cover desktop/phone, tutor/student/dual-role navigation, reloads, Progress and forged metadata. Screenshots use test data.
