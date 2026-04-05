import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-amber-500/30">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#030303]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <h1 className="text-lg font-normal tracking-tight">Terms of Service (Mainnet Beta)</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Mainnet Beta Warning Banner */}
        <div className="mb-10 p-5 border border-amber-500/20 bg-amber-500/10 rounded-xl flex gap-4 items-start">
          <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200/90 leading-relaxed">
            <strong className="text-amber-400 block text-base mb-2">
              Notice: Mainnet Beta
            </strong>
            <p>
              This application is running on the <strong>Solana Mainnet</strong>. Transactions
              involve <strong>real assets</strong>. Please review all actions carefully before
              signing.
            </p>
            <p className="mt-2">
              Smart contracts are in beta and have not been fully audited. Use at your own risk.
            </p>
          </div>
        </div>

        <div className="space-y-10 text-white/70 text-sm leading-relaxed">
          <section>
            <h2 className="text-white text-base font-normal mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Axis platform ("Service"), you acknowledge that this
              is a beta version running on Solana Mainnet. You agree to be bound
              by these Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">
              2. Nature of Service (Mainnet Beta)
            </h2>
            <p>
              The Service operates on the Solana Mainnet.
              <strong> You acknowledge that:</strong>
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-white/60">
              <li>
                All transactions involve <strong>real assets</strong> on the Solana blockchain.
              </li>
              <li>
                The Service is in beta. Smart contracts have not been fully audited and may contain bugs.
              </li>
              <li>
                The Service may be paused or updated at any time. Axis is not liable for losses
                arising from smart contract bugs or protocol changes during the beta period.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">
              3. No Financial Advice or Service
            </h2>
            <p>
              Axis is a software prototype and does not provide financial services, investment
              advice, or custody of real assets. The platform is designed to demonstrate the
              functionality of automated token strategies and index fund creation concepts.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">4. User Responsibilities</h2>
            <p>
              You are responsible for managing your own wallet and verifying all transactions
              before signing. This is a beta product — use only funds you can afford to lose
              during this period.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">5. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind. We
              do not guarantee that the Service will be secure, error-free, or uninterrupted. Smart
              contracts are in beta and have not been fully audited.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">6. Limitation of Liability</h2>
            <p>
              Axis shall not be liable for any damages arising from your use of the Service,
              including but not limited to data loss, service interruptions, or losses arising
              from smart contract bugs during the beta period.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">
              7. Feedback & Intellectual Property
            </h2>
            <p>
              We welcome feedback on bugs and features. By submitting feedback, you grant Axis the
              right to use it without restriction or compensation. All content and code on the
              Service are the property of Axis.
            </p>
          </section>

          <section>
            <h2 className="text-white text-base font-normal mb-3">8. Changes to Terms</h2>
            <p>
              We reserve the right to update these Terms or the functionality of the platform
              at any time.
            </p>
          </section>

          <div className="pt-8 border-t border-white/10 text-white/40 text-xs">
            <p>Last updated: February 12, 2026</p>
            <p className="mt-2">
              Environment: <strong>Solana Mainnet (Beta)</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
