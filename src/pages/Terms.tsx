import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
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
          <h1 className="text-xl font-semibold text-white">Terms of Service</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[430px] mx-auto px-4 py-6">
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-white/60 text-sm mb-6">Last updated: December 2024</p>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              By accessing or using Spotted, you agree to be bound by these Terms of Service. 
              If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Spotted is a social application that allows users to share their location with friends, 
              discover where friends are spending time, and connect with their social circle at various venues.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">3. User Accounts</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              You are responsible for safeguarding your account credentials and for any activities 
              under your account. You must:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your password</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Be at least 18 years old to use this service</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">4. Acceptable Use</h2>
            <p className="text-white/80 text-sm leading-relaxed mb-2">
              You agree not to:
            </p>
            <ul className="text-white/80 text-sm space-y-1 list-disc list-inside">
              <li>Use the service for any illegal purpose</li>
              <li>Harass, abuse, or harm another person</li>
              <li>Share false or misleading information</li>
              <li>Impersonate others or misrepresent your affiliation</li>
              <li>Attempt to gain unauthorized access to any part of the service</li>
              <li>Interfere with or disrupt the service</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">5. Location Data</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              By using Spotted, you consent to the collection and use of your location data as 
              described in our Privacy Policy. You can control who sees your location through 
              your privacy settings.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">6. Content</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              You retain ownership of content you post. By posting content, you grant us a 
              non-exclusive license to use, display, and distribute that content within the service.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">7. Termination</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We may terminate or suspend your account at any time for violations of these terms. 
              You may delete your account at any time through the app settings.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Spotted is provided "as is" without warranties. We are not liable for any damages 
              arising from your use of the service.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">9. Changes to Terms</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              We may modify these terms at any time. Continued use of the service after changes 
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact</h2>
            <p className="text-white/80 text-sm leading-relaxed">
              If you have questions about these Terms, please contact us at support@spotted.app
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
