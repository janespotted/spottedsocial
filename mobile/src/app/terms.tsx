import { LegalPage } from '@/components/legal-page';

export default function TermsScreen() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="December 2024"
      sections={[
        {
          heading: '1. Acceptance of Terms',
          body: 'By accessing or using Spotted, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.',
        },
        {
          heading: '2. Description of Service',
          body: 'Spotted is a social application that allows users to share their location with friends, discover where friends are spending time, and connect with their social circle at various venues.',
        },
        {
          heading: '3. User Accounts',
          body: 'You are responsible for safeguarding your account credentials and for any activities under your account. You must:',
          bullets: [
            'Provide accurate and complete information',
            'Maintain the security of your password',
            'Notify us immediately of any unauthorized access',
            'Be at least 18 years old to use this service',
          ],
        },
        {
          heading: '4. Acceptable Use',
          body: 'You agree not to:',
          bullets: [
            'Use the service for any illegal purpose',
            'Harass, abuse, or harm another person',
            'Share false or misleading information',
            'Impersonate others or misrepresent your affiliation',
            'Attempt to gain unauthorized access to any part of the service',
            'Interfere with or disrupt the service',
          ],
        },
        {
          heading: '5. Location Data',
          body: 'By using Spotted, you consent to the collection and use of your location data as described in our Privacy Policy. You can control who sees your location through your privacy settings.',
        },
        {
          heading: '6. Content',
          body: 'You retain ownership of content you post. By posting content, you grant us a non-exclusive license to use, display, and distribute that content within the service.',
        },
        {
          heading: '7. Termination',
          body: 'We may terminate or suspend your account at any time for violations of these terms. You may delete your account at any time through the app settings.',
        },
        {
          heading: '8. Limitation of Liability',
          body: 'Spotted is provided "as is" without warranties. We are not liable for any damages arising from your use of the service.',
        },
        {
          heading: '9. Changes to Terms',
          body: 'We may modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.',
        },
        {
          heading: '10. Contact',
          body: 'If you have questions about these Terms, please contact us at support@spotted.app',
        },
      ]}
    />
  );
}
