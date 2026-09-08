import { LegalPage } from '@/components/legal-page';

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="December 2024"
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
          ],
        },
        {
          heading: '3. Location Data',
          body: 'Your location is only shared according to your privacy settings. You can choose to share with close friends only, all friends, or mutual friends. We do not sell location data to third parties.',
        },
        {
          heading: '4. Information Sharing',
          body: 'We share your information:',
          bullets: [
            'With friends according to your privacy settings',
            'With service providers who assist our operations',
            'When required by law or to protect rights',
            'In aggregated, anonymized form for analytics',
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
          body: 'We retain your data while your account is active. When you delete your account, we delete your personal data within 30 days, except where required by law.',
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
