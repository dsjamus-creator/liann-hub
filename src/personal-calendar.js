export function mountPersonalCalendar(root, request) {
  const message = root.querySelector('[role=status]')
  const account = root.querySelector('[name=googleAccount]')
  const calendar = root.querySelector('[name=googleCalendar]')
  const events = root.querySelector('[data-personal-events]')
  const disconnect = root.querySelector('[data-calendar-disconnect]')
  let revision = 0
  function fill(select, rows, label, initial) {
    select.replaceChildren(...rows.map(row => new Option(label(row), row.id, false, row.id === initial)))
    select.disabled = rows.length === 0
  }
  function report(operation) {
    operation.catch(error => {
      if (root.isConnected) message.textContent = error.message || 'Calendar is unavailable.'
    })
  }
  async function showEvents() {
    const version = ++revision
    events.replaceChildren()
    if (!account.value || !calendar.value) return
    message.textContent = 'Loading events…'
    const result = await request('GET', '/' + account.value + '?calendar=' + encodeURIComponent(calendar.value))
    if (!root.isConnected || version !== revision) return
    const list = document.createElement('ul')
    list.className = 'workspace-list'
    for (const event of result.events) {
      const item = document.createElement('li')
      const instant = event.start && new Date(event.start)
      const when = instant && Number.isFinite(+instant)
        ? (event.start.length === 10
          ? instant.toLocaleDateString('en-GB', { timeZone: 'UTC', dateStyle: 'medium' })
          : instant.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))
        : ''
      item.textContent = [when, event.title].filter(Boolean).join(' · ')
      list.append(item)
    }
    events.append(list)
    message.textContent = result.truncated ? 'Showing the first 250 events.' : result.events.length ? '' : 'No upcoming events in the next 60 days.'
  }
  async function showCalendars() {
    const version = ++revision
    fill(calendar, [], () => '')
    events.replaceChildren()
    disconnect.disabled = !account.value
    if (!account.value) return
    message.textContent = 'Loading calendars…'
    const result = await request('GET', '/' + account.value)
    if (!root.isConnected || version !== revision) return
    fill(calendar, result.calendars, row => row.name || row.id, result.calendars.find(row => row.primary)?.id)
    if (!result.calendars.length) message.textContent = 'No calendars are available for this account.'
    else await showEvents()
  }
  async function refresh() {
    const version = ++revision
    const selected = account.value
    message.textContent = 'Loading Google accounts…'
    const result = await request('GET', '')
    if (!root.isConnected || version !== revision) return
    fill(account, result.accounts, row => row.google_email, selected)
    if (!result.accounts.length) message.textContent = 'Connect a Google account to view its calendars here.'
    await showCalendars()
  }
  account.onchange = () => report(showCalendars())
  calendar.onchange = () => report(showEvents())
  root.querySelector('[data-calendar-refresh]').onclick = () => report(refresh())
  root.querySelector('[data-calendar-connect]').onclick = () => {
    const popup = window.open('', '_blank')
    if (!popup) {
      message.textContent = 'Allow the Google sign-in tab to open, then try again.'
      return
    }
    popup.opener = null
    report(request('POST', '/connect').then(({url}) => {
      if (new URL(url).origin !== 'https://accounts.google.com') throw Error('Invalid Google sign-in link.')
      popup.location.replace(url)
      if (root.isConnected) message.textContent = 'Complete Google sign-in, then select Refresh calendars.'
    }).catch(error => {
      popup.close()
      throw error
    }))
  }
  disconnect.onclick = () => {
    const id = account.value
    if (id && window.confirm('Disconnect this Google calendar account from your Hub?')) {
      report(request('DELETE', '/' + id).then(refresh))
    }
  }
  report(refresh())
}
