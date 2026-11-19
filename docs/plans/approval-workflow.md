# Plan: barang approval workflow

**Status:** In progress

## Goal

Material requests go through an approval step before stock and `MaterialUsage` are changed.

- Staff submit requests from `#usage`.
- Borrowers see their request status on a dedicated page.
- Admins approve or reject requests in the app and from Telegram inline buttons.
- Only approved requests change stock and create `MaterialUsage` rows.
- Rejected requests are never recorded in `MaterialUsage` and are shown as rejected to the borrower.

## Roles and pages

| Page | Minimum role | Purpose |
| --- | --- | --- |
| `#usage` | staff/admin | Submit a request |
| `#approvals` | admin | Review pending requests and approve/reject |
| `#myrequests` | staff/storekeeper/admin | View request status |
| `#telegram` | storekeeper/admin | Existing history view |

Storekeepers can view their own requests but cannot approve them.

## Google Sheet

Use a new `PermohonanBarang` sheet. Append columns only; do not reorder existing sheet columns.

| Column | Field |
| --- | --- |
| A | request_id |
| B | timestamp |
| C | applicant_user_id |
| D | applicant_email |
| E | applicant_name |
| F | purpose |
| G | category |
| H | material |
| I | specification |
| J | size |
| K | quantity |
| L | unit |
| M | status (`pending`, `approved`, `rejected`) |
| N | reviewed_at |
| O | reviewed_by |
| P | telegram_message_id |

If Telegram actions are configured, the last Telegram `chat_id` and `message_id` can be stored for callbacks.

## Backend flow

1. `usage` validates the submitted items and creates one row per item in `PermohonanBarang` with status `pending`.
2. Stock is not changed and `MaterialUsage` is not appended at submission time.
3. Apps Script sends one Telegram approval message per request with inline buttons:
   - `approve:<request_id>`
   - `reject:<request_id>`
4. Admin app actions call `approveRequest` or `rejectRequest`.
5. Telegram callback updates call the same backend functions.
6. On approval, each requested row is checked again against current stock. If stock is enough, it reduces `Stock` and appends `MaterialUsage` with the audit account. If stock changed and is now insufficient, leave the request rejected with an error reason and do not record partial usage.
7. On rejection, update status to `rejected` only. Do not touch stock or `MaterialUsage`.

## Telegram security

Telegram callbacks do not carry the Supabase access token. Configure these Script Properties:

- `TELEGRAM_ADMIN_IDS`: comma-separated Telegram numeric user IDs.
- `TELEGRAM_CHAT_ID`: existing approval group chat ID.
- `TELEGRAM_TOKEN`: existing bot token.

Apps Script must reject callback users whose numeric ID is not in `TELEGRAM_ADMIN_IDS`. It must also verify that the callback belongs to the configured chat/group when applicable.

The Telegram callback channel requires the bot webhook to be set to the Apps Script `/exec` URL. It cannot use Telegram inline buttons without a webhook or a continuously polling bot service.

The existing Telegram group chat is the admin notification channel. Borrower direct Telegram notification is not possible until each account stores a Telegram chat ID and that chat starts a private conversation with the bot.

## New API actions

| Action | Role | Result |
| --- | --- | --- |
| `createUsageRequest` | staff/admin | Create pending rows |
| `getMyRequests` | active user | Borrower's rows |
| `getPendingRequests` | admin | Pending rows grouped by request |
| `approveRequest` | admin | Approve and deduct stock |
| `rejectRequest` | admin | Reject without stock changes |
| `telegramWebhook` | Telegram callback secret | Receive Telegram updates |

Existing `usage` remains temporarily compatible but must not be used for new frontend requests until migration is complete.

## Browser UI

- Submission success: "Permohonan dihantar dan menunggu kelulusan admin." It must not say stock is recorded.
- My requests page: status badges `Menunggu`, `Diluluskan`, `Ditolak`.
- Admin approvals page: grouped request details, quantity and stock, **Lulus** / **Tolak** buttons.

## Partial failure rules

For a request with several items:

- Validate every item against current stock before changing any stock.
- If all items pass, process all rows, append one `MaterialUsage` row per item, then set status approved.
- If one item fails, reject/leave pending and change no stock.

This avoids partial usage caused by stock changing during approval.

## Telegram setup

1. Set `TELEGRAM_ADMIN_IDS` after collecting Telegram numeric IDs for each admin.
2. Set `TELEGRAM_CHAT_ID` to the approval group.
3. Deploy the Apps Script new version.
4. Set the Telegram bot webhook with the bot token and `/exec` URL.
5. Test one pending request and one callback before enabling the workflow.

## Test checklist

- [ ] Submit request creates pending rows and no stock change.
- [ ] Submit request does not create `MaterialUsage` rows.
- [ ] Borrower sees pending status.
- [ ] Admin app can approve with sufficient stock.
- [ ] Approved request adds usage rows and deducts stock exactly once.
- [ ] Rejected request adds no usage row and no stock change.
- [ ] Repeat approval/rejection is rejected by state check.
- [ ] Telegram callback is accepted only by configured admin IDs.
- [ ] Telegram callback rejects another chat and unknown callback data.
- [ ] Insufficient stock at approval causes no partial deduction.
- [ ] `npm run lint` and `npm run build` pass.
