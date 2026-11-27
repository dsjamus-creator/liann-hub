// The existing authenticated admin client supplies the latest saved Gmail check.
export async function loadPinyinOutreach(root, request) {
  try {
    const { status, body } = await request('/admin/pinyin-outreach')
    if (!root.isConnected) return
    if (status !== 200) throw new Error('Outreach request failed')
    if (!body.snapshot) {
      root.replaceChildren(element('p', 'No outreach check has been saved yet.'))
    } else {
      renderTracker(root, body.snapshot)
    }
  } catch {
    if (!root.isConnected) return
    const retry = element('button', 'Retry')
    retry.type = 'button'
    retry.className = 'btn ghost'
    retry.addEventListener('click', () => {
      root.setAttribute('aria-busy', 'true')
      root.replaceChildren(element('p', 'Loading outreach tracker…'))
      void loadPinyinOutreach(root, request)
    })
    root.replaceChildren(element('p', 'Could not load the outreach tracker. Check your connection and Super Admin access.'), retry)
  } finally {
    if (root.isConnected) root.removeAttribute('aria-busy')
  }
}

function element(tag, text) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function renderTracker(root, { checked_at, groups }) {
  const totals = groups.reduce((total, group) => ({
    addresses: total.addresses + group.addresses,
    acknowledgements: total.acknowledgements + group.acknowledgements,
    replies: total.replies + group.replies,
    bounces: total.bounces + group.bounces,
  }), { addresses: 0, acknowledgements: 0, replies: 0, bounces: 0 })
  const metrics = element('dl')
  metrics.className = 'outreach-metrics'
  for (const [label, value] of [
    ['Initial emails sent', 6],
    ['External addresses', totals.addresses],
    ['Auto acknowledgements', totals.acknowledgements],
    ['Human replies', totals.replies],
    ['Delivery failures', totals.bounces],
  ]) {
    const metric = element('div')
    metric.append(element('dt', label), element('dd', value))
    metrics.append(metric)
  }

  const region = element('div')
  region.className = 'outreach-table'
  region.tabIndex = 0
  region.setAttribute('role', 'region')
  region.setAttribute('aria-label', 'Outreach status table')
  const table = element('table')
  const heading = table.createTHead().insertRow()
  for (const label of ['Outreach group', 'Addresses', 'Latest status', 'Response window', 'Suggested next step']) {
    const cell = element('th', label)
    cell.scope = 'col'
    heading.append(cell)
  }
  const rows = table.createTBody()
  for (const group of groups) {
    const row = rows.insertRow()
    const name = element('th', group.name)
    name.scope = 'row'
    row.append(name)
    row.insertCell().textContent = group.addresses
    const status = row.insertCell()
    const counts = element('small', `Auto acknowledgements ${group.acknowledgements} · Human replies ${group.replies} · Delivery failures ${group.bounces}`)
    status.append(element('div', group.status), counts)
    row.insertCell().textContent = group.responseWindow
    row.insertCell().textContent = group.nextStep
  }
  region.append(table)
  const time = element('time', new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London',
  }).format(new Date(checked_at)))
  time.dateTime = checked_at
  const checked = element('p', 'Gmail checked ')
  checked.className = 'muted'
  checked.append(time, ' London time')
  root.replaceChildren(metrics, region, checked)
}
