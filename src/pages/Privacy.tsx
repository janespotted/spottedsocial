import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center gap-4 p-6 max-w-[430px] mx-auto">
          <button 
            onClick={() => navigate(-1)}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold text-white">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[430px] mx-auto px-4 py-6">
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-white/60 text-sm mb-6">Last updated: December 2024</p>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">1. Information We Collect</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              We collect information you provide directly:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>Account information (name, email, username)</li>
              <li>Profile information (bio, avatar)</li>
              <li>Location data when you check in</li>
              <li>Content you post (messages, stories, posts)</li>
              <li>Friend connections and interactions</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              We use your information to:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>Provide and improve our services</li>
              <li>Show your location to friends (based on your privacy settings)</li>
              <li>Connect you with friends at venues</li>
              <li>Send notifications about friend activity</li>
              <li>Ensure safety and security</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">3. Location Data</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Your location is only shared according to your privacy settings. You can choose to share 
              with close friends only, all friends, or mutual friends. We do not sell location data 
              to third parties.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">4. Information Sharing</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              We share your information:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>With friends according to your privacy settings</li>
              <li>With service providers who assist our operations</li>
              <li>When required by law or to protect rights</li>
              <li>In aggregated, anonymized form for analytics</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We implement industry-standard security measures to protect your data, including 
              encryption in transit and at rest, secure authentication, and regular security audits.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">6. Your Rights</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              You have the right to:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your account and data</li>
              <li>Export your data</li>
              <li>Opt out of certain data processing</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">7. Data Retention</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We retain your data while your account is active. When you delete your account, 
              we delete your personal data within 30 days, except where required by law.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">8. Children's Privacy</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Spotted is not intended for users under 18. We do not knowingly collect data 
              from children under 18.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">9. Changes to Privacy Policy</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We may update this policy periodically. We will notify you of significant changes 
              through the app or via email.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact Us</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              For privacy-related questions, contact us at privacy@spotted.app
            </p>
          </section>
        </div>

        <Button
          onClick={() => navigate(-1)}
          className="w-full mt-6 bg-[#a855f7] hover:bg-[#a855f7]/90 text-white font-semibold"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
