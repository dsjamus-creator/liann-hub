import { loadPinyinOutreach } from './pinyin-outreach.js'

export const campaigns = [{
  id: 'london-colleges-pinyin',
  title: 'London Colleges Pinyin Challenge',
  startDate: '2026-11-26',
  description: 'Outreach for the 25 January to 5 February 2027 pilot.',
  correspondenceUrl: 'https://mail.google.com/mail/u/?authuser=info%40lwliann.com#search/' +
    encodeURIComponent('subject:"Pinyin Challenge" after:2026/11/25'),
  loadTracker: loadPinyinOutreach,
}]

export function selectedCampaign(id) {
  return campaigns.find(campaign => campaign.id === id) ?? campaigns[0]
}
