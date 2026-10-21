import { LegalPage } from '@/components/legal-page';

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="October 2026"
      sections={[
        {
          heading: '1. Information We Collect',
          body: 'We collect information you provide directly:',
          bullets: [
            'Account information (name, email, username)',
            'Profile information (bio, avatar)',
            'Location data when you check in',
            'Content you post (messages, stories, posts)',
            'Friend connections and interactions',
            'Basic usage events, such as app opens, saves, plan replies, failed actions and notification opt-outs. These are linked to your account for up to 90 days to understand whether Spotted is useful. Usage events do not include message text, contact numbers or GPS coordinates.',
          ],
        },
        {
          heading: '2. How We Use Your Information',
          body: 'We use your information to:',
          bullets: [
            'Provide and improve our services',
            'Show your location to friends (based on your privacy settings)',
            'Connect you with friends at venues',
            'Send notifications about friend activity',
            'Ensure safety and security',
            'Measure app sessions, screen categories, successful actions and technical failures to improve Spotted. These operational events are linked to your account privately for up to 90 days; founder reports show aggregate activity and limited account diagnostics for setup, connections and repeated technical failures. We do not record message content, contact lists, screenshots or GPS in this analytics stream.',
          ],
        },
        {
          heading: '3. Location Data',
          body: 'Live location is shared according to your audience, hide and block settings. Selecting No tonight shows you counts rather than other people’s live identities. Eligible venue visits, without GPS coordinates, can remain visible for 90 days to people who were allowed to see your location at the time; current sharing restrictions are checked again. Your private replay is visible only to you. You can choose to share with close friends only, all friends, or mutual friends. We do not sell location data to third parties.',
        },
        {
          heading: '4. Information Sharing',
          body: 'We share your information:',
          bullets: [
            'With friends according to your privacy settings',
            'With service providers who assist our operations',
            'When required by law or to protect rights',
            'In aggregate reports for product analytics',
          ],
        },
        {
          heading: '5. Data Security',
          body: 'We implement industry-standard security measures to protect your data, including encryption in transit and at rest, secure authentication, and regular security audits.',
        },
        {
          heading: '6. Your Rights',
          body: 'You have the right to:',
          bullets: [
            'Access your personal data',
            'Correct inaccurate data',
            'Delete your account and data',
            'Export your data',
            'Opt out of certain data processing',
          ],
        },
        {
          heading: '7. Data Retention',
          body: 'At 5am in your profile city, tonight’s live content stops appearing. This is not a promise that every stored copy is immediately erased: private replays, eligible 90-day venue visits, account data and operational records have separate retention. Account deletion is available in Settings. Screenshot protection is enabled on supported native devices for DMs, Newsfeed and Activity Center; it cannot prevent someone photographing a screen with another device.',
        },
        {
          heading: "8. Children's Privacy",
          body: 'Spotted is not intended for users under 18. We do not knowingly collect data from children under 18.',
        },
        {
          heading: '9. Changes to Privacy Policy',
          body: 'We may update this policy periodically. We will notify you of significant changes through the app or via email.',
        },
        {
          heading: '10. Contact Us',
          body: 'For privacy-related questions, contact us at privacy@spotted.app',
        },
      ]}
    />
  );
}
