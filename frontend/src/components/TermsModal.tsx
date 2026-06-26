import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollText, ShieldCheck, Check } from "lucide-react";
import { api } from "@/lib/api";

// ─── Raw document text ────────────────────────────────────────────────────────
// Extracted from Elle.Be.O legal documents. Word field codes stripped below.

const RAW_SERVICE_AGREEMENT = `Elle.Be.O Individual Professional Service Agreement

PARTIES
Name: Elle.Be.O Pty Ltd ABN 11 696 711 207
Address: 10 Taleeban Road Riverview NSW 2066
Email: info@ellebeo.com

BACKGROUND
Elle.Be.O is in the business of providing, supplying and maintaining the Platform and providing other services to Professionals that operate their own businesses. The Professional is an independent beauty professional, technician or practitioner approved by Elle.Be.O to provide the Professional Services through or in connection with the Platform. Where the Professional provides Medical Aesthetics Services, the Professional must hold all registrations, licences, qualifications, insurances and clinical approvals required by Law. The Professional has satisfied the Platform Gateway requirements. In consideration for the Service Fee, Elle.Be.O has agreed to provide the Services and Platform Use to the Professional.

1. DEFINED TERMS AND INTERPRETATION
1.1 Defined terms
In this Agreement, unless otherwise indicated by the context:
"Agreement" means this Agreement and its schedules and annexures.
"Ahpra" means the Australian Health Practitioner Regulation Agency.
"Australian Privacy Principles" means the Australian Privacy Principles set out at Schedule 1 of the Privacy Act 1988 (Cth).
"Background Intellectual Property" means the Intellectual Property created, developed, owned, or acquired by a Party prior to the Date of Agreement, or any Intellectual Property which is created or acquired by a Party independently of this Agreement.
"Business Day" means a day that is not a Saturday, Sunday, public holiday or bank holiday in Sydney, New South Wales.
"Business Hours" means 9.00am to 5.00pm on a Business Day.
"Client" means the recipient who books and/or receives the Professional Service.
"Client Records" means hard copy and electronic data provided to, received, or created by the Professional during the course of providing the Professional Services, including progress notes, consultation notes and other records.
"Confidential Information" means all confidential information of a Party, including trade secrets, policies and procedures, financial, accounting, marketing and technical information, strategy plans, customer and supplier lists, know-how, technology, clinical and operating procedures, handbooks, price lists, data bases, source codes and methodologies. It does not include information that is public knowledge.
"Consequential Loss" means any loss that cannot reasonably be considered to arise naturally from a breach, including consequential, special, indirect, exemplary or punitive loss, and loss of profit, revenue, goodwill, opportunity or savings.
"Educational Resources" means the resources Elle.Be.O provides to the Professional, via the Platform or other means, to educate and support the Professional about the development of their marketing, business growth, platform use and, where applicable, compliance obligations. Educational Resources do not replace the Professional's own qualifications, regulatory obligations, clinical judgement or professional training.
"Force Majeure Event" means strikes, lockouts, riots, accidents, fires, floods, tempests, earthquake, act of God, material shortage, rebellion, revolution or any other cause beyond the reasonable control of the non-performing Party.
"Good Medical Practice" means, where applicable, the practices and methods reflecting evidence-based best practice, applicable professional standards, and Ahpra's Good medical practice: a code of conduct for doctors in Australia.
"Gross Receipts" means the gross receipts derived from the Professional's performance of Professional Services.
"Initial Period" means 3 months from the Date of Agreement.
"Intellectual Property Rights" means all intellectual property rights including patents, copyright, registered designs, trademarks and any right to have confidential information kept confidential.
"Law" means the common law, equity and any statute, regulation, order, rule, subordinate legislation, or other document enforceable under any statute.
"Moral Rights" means the rights under the Copyright Act 1968 (Cth) including the right of integrity of authorship, right of attribution, and right not to have authorship falsely attributed.
"Permitted Use" means a use of the online Platform as agreed between Elle.Be.O and the Professional.
"Personal Information" has the meaning given by the Privacy Act 1988 (Cth).
"Platform" means the Elle.Be.O application available at https://www.ellebeo.com or application available for download on iOS or Android devices.
"Platform Terms of Use" means the terms of use provided by Elle.Be.O for all users of the Platform.
"Privacy Laws" means the Privacy Act 1988 (Cth), Australian Privacy Principles, Health Records and Information Privacy Act 2002 (NSW), and Health Privacy Principles.
"Professional" means the Professional named in the Details who will provide the Professional Service.
"Professional Services" means the Professional Services provided by the Professional booked through, via, or in connection with, the Platform.
"Service Fee" means the fee set out in Schedule 1.
"Services" means the services provided by Elle.Be.O to the Professional as set out in Schedule 1.
"Term" means the duration of this Agreement.
"Unacceptable Behaviour" means any form of physical or verbal aggression including threats, or inappropriate conduct, including sexist, homophobic, racist, sexual or religiously intolerant contact, and acts of property damage.

1.2 Interpretation
In this Agreement: words importing the singular include the plural and vice versa; headings are for convenience only and do not affect interpretation; a reference to a Party includes that Party's legal personal representatives, successors and permitted assigns; a covenant or agreement on the part of two or more persons binds or benefits them jointly and severally.

2. SERVICES AND PLATFORM USE
In consideration for the Service Fee, during the Term, Elle.Be.O agrees to: (a) provide the Professional with the Services; and (b) grant the Professional the right to access the Platform in accordance with the Platform Terms of Use for the Permitted Use.

3. TERM OF AGREEMENT
This Agreement commences on the Date of Agreement and continues until the End Date, or until terminated in accordance with clause 13.

4. SERVICE FEES
4.1 The Professional will pay the Service Fee to Elle.Be.O in consideration for the Services and Platform Use. Elle.Be.O will issue an invoice monthly and direct debit the Professional's Nominated Account 7 days after the invoice date.

4.2 Platform payment arrangements and booking cancellations
Upon confirmation of a booking by the Client: (a) the Deposit is processed by Elle.Be.O and paid directly to the Professional; and (b) the Booking Fee is collected and retained by Elle.Be.O.

If the Professional cancels a booking, the Professional will either provide an alternative time within 7 Business Days or reimburse the Deposit to Elle.Be.O's Bank Account within 14 days.

If the Client cancels: the Professional is entitled to retain the Deposit; Elle.Be.O is entitled to retain the Booking Fee.

Elle.Be.O does not have any right to direct payment or recovery of any of the Professional's Gross Receipts.

5. THE PROFESSIONAL'S OBLIGATIONS
5.1 General obligations
The Professional must:
(a) use the online Platform only in accordance with the Permitted Use and Platform Terms of Use;
(b) materially comply with all policies and procedures of Elle.Be.O including the Elle.Be.O Privacy Policy;
(c) not engage in any advertising or marketing practices that may cause Elle.Be.O to breach any legal obligation, damage its reputation, or harm Elle.Be.O Intellectual Property;
(d) adhere at all times to the highest standards of honesty, integrity, fair dealing, ethical conduct and common courtesy;
(e) comply with all Laws and ethical requirements regarding the conduct of the Professional Services;
(f) where registered with Ahpra or providing Medical Aesthetics Services, hold and maintain all required registrations, licences, qualifications and approvals, and notify Elle.Be.O if any is subject to conditions, restrictions, suspension or cancellation;
(g) where applicable, provide the Professional Services in accordance with Good Medical Practice;
(h) obtain informed consent from Clients before commencing any treatment or providing any prescription;
(i) provide the Professional Services with due skill and care;
(j) report adverse events and unexpected reactions to Elle.Be.O within 7 Business Days;
(k) immediately inform Elle.Be.O of any information that may affect the business and reputation of Elle.Be.O;
(l) be responsible for their own tax and superannuation contributions;
(m) take sole responsibility for care of Clients — Elle.Be.O will not take any responsibility for care provided by the Professional;
(n) make it clear to Clients that the Professional Services are provided by the Professional and not Elle.Be.O; and
(o) take sole responsibility for the appropriate billing of Professional Services.

6. NATURE OF THE PROFESSIONAL'S RIGHTS
This Agreement: (a) is personal and not assignable or capable of being delegated; (b) does not give the Professional any tenancy, estate or interest in the Platform or Elle.Be.O's Intellectual Property; (c) does not create any relationship of partnership, employment, or agency between Elle.Be.O and the Professional; and (d) cannot be sub-licensed, mortgaged or encumbered.

7. WARRANTIES
7.1 The Professional warrants that:
(a) they hold appropriate qualifications and have appropriate training and experience in providing the Professional Services;
(b) they will provide information to Elle.Be.O that is true, correct and compliant with applicable Laws;
(c) they have satisfied the Platform Gateway;
(d) they will be solely responsible for entering into their own terms of service with each Client and paying all applicable taxes, levies and costs;
(e) where they hold a registration required to provide the Professional Services, they are not subject to any conditions that would prevent or restrict provision of those services;
(f) they are not aware of any ongoing or expected disciplinary action by a relevant professional body; and
(g) they will immediately inform Elle.Be.O in writing of any changes to these warranted matters during the Term.

8. CESSATION OF PROFESSIONAL SERVICES
In the event a Client engages in any form of Unacceptable Behaviour, the Professional may immediately cease provision of Professional Services to that Client and promptly report any such incidents to Elle.Be.O.

9. CLIENT RECORDS
The Professional must create and maintain Client Records sufficient to enable other persons to use such records with a full understanding of the Client's service history, and compliant with Good Medical Practice and the requirements of all relevant Laws. Client Records belong solely to the Professional.

10. INSURANCE
The Professional must take out and maintain at their own expense:
(a) public liability insurance in the minimum amount of $10,000,000 for any one claim;
(b) workers compensation insurance for its servants; and
(c) adequate professional indemnity insurance, as a minimum for the Term until 7 years after the End Date.

11. LIABILITY
11.1 Limitation of liability
Neither Party is liable to the other for any Consequential Loss in connection with this Agreement. Elle.Be.O's liability to the Professional in connection with this Agreement is limited to the total Service Fee paid during the 12 month period prior to the alleged liability arising.

12. INDEMNITY
12.1 Each Party agrees to indemnify and keep the other Party indemnified against all claims, suits, expenses, loss, actions or demands arising out of or in relation to: (a) the other Party's performance of their obligations under the Agreement; and (b) any act or omission by the other Party, except to the extent the relevant loss or liability is caused or contributed to by the other Party.

12.2 The Professional indemnifies Elle.Be.O against all claims, suits, expenses, loss, actions, costs or demands arising out of or in connection with the Professional Services.

12.3 The indemnities under this clause are continuing and independent obligations that survive termination of this Agreement.

13. TERMINATION OF AGREEMENT
13.1 Probation during Initial Period
During the Initial Period this Agreement may be terminated by Elle.Be.O at any time immediately without cause.

13.2 Termination after the Initial Period for failure to achieve 4-star rating
Elle.Be.O may terminate this Agreement immediately in the event the Professional fails to achieve or maintain at least a 4 out of 5-star Client Review average at any time.

13.3 Termination for convenience
This Agreement may be terminated by either Party giving at least four weeks' notice in writing (or one week's notice if less than six months after commencement).

13.4 Termination for breach
Either Party may terminate this Agreement with immediate effect if: (a) the other Party breaches any provision and fails to remedy the breach within 30 days after written notice; (b) the other Party breaches a material provision that is not capable of remedy; or (c) the other Party becomes bankrupt or insolvent.

Elle.Be.O may terminate with immediate effect if the Professional brings Elle.Be.O into disrepute or is deprived of the privilege of practicing as a medical practitioner.

13.5 Consequences of termination
Termination does not affect any accrued rights or remedies of either Party.

13.6 Survival
Any term intended to survive termination will survive, including Client Records, insurance, liability, indemnity, confidential information and privacy clauses.

14. NOTIFICATION OBLIGATIONS
The Professional must immediately notify Elle.Be.O of: any breach or incident in connection with the performance of Professional Services; changes to any licences, registrations, qualifications or approvals held by the Professional; any decision by any professional body or regulator to investigate the Professional; any allegation of malpractice or unprofessional conduct; and any extenuating circumstances that may affect the Professional's ability to provide the Professional Services.

15. CONFIDENTIAL INFORMATION
Either Party must not, without explicit written authorisation of the other Party, remove, use or disclose any of the other Party's Confidential Information. The Professional must use Confidential Information only for the purposes of this Agreement and keep all Confidential Information confidential except as permitted under this clause or required by Law.

16. PRIVACY
The Parties acknowledge that they may each hold Personal Information of Clients. The Professional agrees that they (and any employees, contractors or agents) will: comply with all privacy, confidentiality and security measures notified by Elle.Be.O, including the Elle.Be.O Privacy Policy; comply with Privacy Laws in relation to the collection, use and disclosure of Personal Information and Health Information; not do anything that might cause the other Party to breach its privacy and confidentiality obligations; and immediately notify Elle.Be.O in writing of any actual or suspected breach of privacy, confidentiality or security measures.

17. INTELLECTUAL PROPERTY
17.1 Background Intellectual Property
All Background Intellectual Property remains the sole and exclusive property of the Party that makes it available. Elle.Be.O grants the Professional a limited, revocable, royalty-free, non-exclusive, non-transferable and non-sublicensable licence to use Elle.Be.O's Background Intellectual Property during the Term solely for the purpose of performing the Professional Services.

17.2 Developed Intellectual Property
All Developed Intellectual Property vests in and is the exclusive property of Elle.Be.O upon its creation. The Professional hereby assigns all right, title and interest in such Developed Intellectual Property to Elle.Be.O, and irrevocably waives all Moral Rights in relation to same.

17.3 Educational Resources
All Educational Resources vest in and are the exclusive property of Elle.Be.O upon their creation. Elle.Be.O grants the Professional a limited, revocable, royalty-free, non-exclusive licence to use the Educational Resources during the Term solely for the purpose of performing the Professional Services.

18. DISPUTE RESOLUTION
In the event of a dispute, either Party may give the other Party a Notice of Dispute. Within 10 Business Days the parties must meet to attempt to resolve the dispute in good faith. If not resolved within 20 Business Days, the Parties will appoint a Mediator by agreement. If the Dispute is not resolved within 20 Business Days of the Mediator's appointment, either Party may commence litigation. Nothing prevents a Party from seeking urgent injunctive relief.

19. GST
Any consideration payable under this Agreement, unless specifically described as inclusive of GST, does not include any amount on account of GST. If a supply under this Agreement is subject to GST, the consideration is increased by the GST Amount and the Recipient must pay this to the Supplier at the same time as the GST Exclusive Consideration, subject to the Supplier providing a valid tax invoice.

20. COSTS
The Parties must each pay their own legal and other expenses relating to the negotiation, preparation and execution of this Agreement.

21. NOTICES
A notice required or permitted to be given must be in writing and delivered by email. A notice sent by email during Business Hours is taken to have been given upon the return of a receipt confirming successful transmission or by the end of the last Business Hour on the day the email was sent.

22. GENERAL
22.1 Relationship — This Agreement does not create a relationship of employment, trust, agency, joint venture, or partnership between the Parties.
22.2 No transfer — Neither Party may transfer its rights and obligations under this Agreement.
22.3 Alterations — This Agreement may be altered only in writing and must be signed by each Party.
22.4 Force Majeure — Neither Party is liable for failure to perform obligations due to a Force Majeure Event.
22.5 Waiver or variation — A Party's failure or delay to exercise a power or right does not operate as a waiver.
22.6 Governing law and jurisdiction — This Agreement is governed by the Laws of New South Wales. Each Party irrevocably submits to the exclusive jurisdiction of the courts of New South Wales.
22.7 Whole Agreement — This Agreement is the whole agreement between the Parties and supersedes all prior oral and written communications.
22.8 Severance — If any part of this Agreement is illegal or unenforceable, it does not include that part. The remainder continues in full force.

SCHEDULE 1 – KEY DETAILS
Date of Agreement: Date Professional enters Platform
End Date: No fixed end date; this Agreement continues until terminated.
Platform: https://www.ellebeo.com and the Elle.Be.O application on iOS and Android.

Platform Gateway (any one of):
- Category leader invitation: the Professional is invited, reviewed or endorsed by an Elle.Be.O category leader or category partner.
- Approved professional referral: recommended by an approved Professional, founding member or category partner.
- Client demand signal: requested, referred or endorsed by Clients in a way that demonstrates existing market trust.
- Direct application to the Elle.Be.O Academy: successful applicants may be listed in the Academy pathway.

Services include:
- Marketing services: profile, content marketing and visibility services.
- Booking services: administrative support for Clients to secure bookings, payment gateways, booking requests, service deposits, rebooking workflows, invoices, Client confirmations, reviews, ratings and complaint pathways.
- Platform exposure: the Professional's approved profile, services, availability, offers and other approved information.
- Educational Resources: resources to support the Professional's business growth, marketing, platform use and compliance awareness.
- Events: events for Professionals to network, learn and build community.

Service Fee:
- Base plan — Monthly: $45.00/month; Annually: $450.00/year
- Premium plan — Monthly: $99.00/month; Annually: $990.00/year

Booking Fee: $6.00 per booking request (as notified by Elle.Be.O from time to time).

Unacceptable Behaviour: any form of physical or verbal aggression (including threats), inappropriate conduct, sexist, homophobic, racist, sexual or religiously intolerant contact, and acts of property damage.`;

const RAW_PRIVACY_POLICY = `Elle.Be.O Privacy Policy

INTRODUCTION
Elle.Be.O is a curated beauty network, which also provides a trusted operating and commerce layer for independent Technicians. This Privacy Policy applies to all the activities operated by Elle.Be.O Pty Ltd (ABN 11 696 711 207).

This includes: the services provided to customers, clients and users on our app and web-based interfaces (Service Users); and the services Elle.Be.O provides to independent beauty professionals (practitioners/technicians/founding members/subject matter experts) who are profiled in our app (Technicians).

This Policy explains how we collect, use and disclose or provide access to personal information. Elle.Be.O is committed to protecting your privacy and maintaining a safe and secure system for handling your personal information in accordance with law.

KEY DEFINITIONS
"Personal information" means any information or an opinion about an identified individual or an individual who is reasonably identifiable (whether true or not and whether recorded in a material form or not). It does not include information that is de-identified.

"Sensitive information" is personal information that includes information about an individual's racial or ethnic origin; political opinions; membership of a political association; religious beliefs or affiliations; philosophical beliefs; membership of a professional or trade association; membership of a trade union; sexual orientation or practices; criminal record. It also includes health information, genetic information, and biometric information.

"Health information" means personal information about the health, illness, disability or injury of an individual, an individual's expressed wishes about the future provision of health services or a health service provided or to be provided to the individual.

"AI system" means a machine-based system that, for explicit or implicit objectives, infers from the input it receives how to generate outputs such as predictions, content, recommendations, or decisions that can influence physical or virtual environments.

DEALING WITH US USING A PSEUDONYM OR ANONYMOUSLY
Where possible and lawful, you can interact with us anonymously. However, for many of our functions and activities we need your name, contact information and other details to enable us to provide our services or products to you. If you do not provide your personal information to us, we may not be able to provide services or products to you.

INFORMATION FOR ELLE.BE.O SERVICE USERS AND TECHNICIANS

WHAT PERSONAL INFORMATION DO WE COLLECT?
We only collect personal information about you that is reasonable and necessary for us to carry out our business functions. Individuals will be reasonably notified at or before the time of collection, or as soon as practical thereafter.

This may include: your name, contact details, gender, date of birth, address, email address and phone number; your interests and preferences; your religious beliefs, sexual orientation, family type, country of birth, and language spoken at home; information to assist in the resolution of complaints; information about payment for services, including your bank account details; any additional information you provide through our forms, app or website; account login details, profile information and user preferences; booking history, appointment details, service preferences, location information and communications with us or Technicians; payment transaction information, deposit, refund, cancellation and dispute information; reviews, ratings, referrals, gifting, loyalty activity, consent records and support requests; health, treatment, medical history, consent, clinical or aftercare information where relevant to cosmetic medicine or other services; for Technicians, professional profile information, ABN or business details, services, pricing, availability, work locations, portfolio images, qualifications, licences, certifications, insurance, verification information, endorsements, reviews, client records, income and payout information; and device, app usage, analytics and technical information, including cookies, IP address, log data and security information.

HOW DO WE COLLECT PERSONAL INFORMATION?
We may collect personal information about you directly from you: through your interactions with us; when you complete a form; when you create or use an account, complete a profile, submit an application, request or manage a booking, make a payment, leave a review, use referral, gifting or loyalty features, use Guardian Hub, SOS, incident-reporting or support features, or otherwise communicate with us.

We may also receive information about you from third parties such as: individuals nominated or authorised by you; Technicians, salons, clinics, category leaders and approved professionals involved in referrals, vetting, bookings or service delivery; payment processors, identity verification providers, booking and calendar providers, software, cloud hosting, analytics, communications, customer support and AI service providers; publicly available sources, social media, websites, professional directories, regulators, professional bodies and other third parties with your consent; and our professional advisers and business partners.

We may also collect personal information through AI systems (e.g. large language model transcription services) when you or your representatives interact with them, or when information from bookings, profiles, reviews, support requests, Brand DNA prompts, consent records or other platform activity is processed by those systems. Our AI systems have been assessed and approved by Elle.Be.O as meeting the security standards required for handling and managing personal information.

PURPOSES FOR WHICH WE COLLECT, USE AND DISCLOSE PERSONAL INFORMATION
We collect, use and disclose your personal information for the following purposes:
- to provide our services;
- to manage, improve, and conduct our business;
- to obtain feedback or manage complaints;
- to respond to queries;
- to create and manage accounts, profiles, Technician applications and approved professional listings;
- to facilitate discovery, bookings, rebookings, deposits, payments, refunds, cancellations, disputes and customer support;
- to verify identity, licences, credentials, insurance, eligibility, vetting status and compliance requirements;
- to operate reviews, referrals, gifting, loyalty, Guardian Hub, SOS, incident-reporting and safety features;
- to personalise recommendations, communications and service discovery, and to operate approved marketing and Growth Studio tools with consent;
- to meet legal, regulatory, insurance, accounting, tax, reporting and risk-management obligations; and
- to develop, test, secure and improve our app, website, products, services, AI systems and business operations.

AUTOMATED DECISION-MAKING
We do not currently use personal information in automated decision-making that substantially and directly affects an individual's rights or interests without human involvement. Technology systems, including AI systems, may assist with recommendations, matching, fraud or safety signals, booking prompts, support triage, content generation and operational workflows. These systems support human review and do not make final decisions about eligibility to join the curated network, suspension or removal of a user, complaint outcomes, or material access to services without appropriate human oversight.

HOW DO WE DISCLOSE PERSONAL INFORMATION?
While providing our products and services to you, we may need to disclose your personal information to third parties, including: Elle.Be.O's current and future related bodies corporate, affiliates, successors and assigns; your relatives, carers, or support persons, with your consent; external contractors or third parties who provide services on our behalf; actual or prospective investors, purchasers, transferees, assignees or other parties involved in any transaction involving all or part of Elle.Be.O's business, platform, assets or services; government agencies, regulatory bodies, and law enforcement agencies; our professional advisers, including lawyers, accountants, or auditors; and where disclosure will prevent or lessen a serious or imminent threat to the life, health or safety of any individual, or is reasonably necessary to take appropriate action in relation to suspected unlawful activity or serious misconduct.

We may disclose some of your personal information to overseas recipients in the United States of America, the United Kingdom, the European Union or European Economic Area, and other countries where our cloud hosting, software, payment, identity verification, analytics, communications, customer support, AI, booking integration and professional service providers store or process information.

We will not sell your personal information to other organisations.

DIRECT MARKETING
With your consent, we may use personal information to send you information about other Elle.Be.O products and services which may be of interest to you. You may opt out at any time by contacting our Privacy Officer. We acknowledge that we are bound by the Spam Act 2003 (Cth) and the Do Not Call Register Act 2006 (Cth).

COOKIES
When you visit our website or app, we use cookies or other similar tracking technologies to track your website usage and remember your preferences. Cookies are necessary to facilitate online transactions and ensure security. If you do not wish to receive any cookies you should set your browser to refuse cookies.

HOW DO WE STORE AND SECURE PERSONAL INFORMATION?
We will hold your personal information primarily through secure electronic records, including cloud-based systems. We will take reasonable and appropriate steps (including technical and organisational measures) to protect the information from misuse, loss or unauthorised access, modification or disclosure. We will only keep your personal information for as long as it is required for the purpose for which it was collected, or as required by applicable laws. If we no longer need to hold your personal information, we will take reasonable steps to de-identify or destroy that information.

HOW CAN YOU ACCESS AND CORRECT YOUR PERSONAL INFORMATION?
If you want to access, correct or raise a query or concern about the personal information we hold about you, you should contact the Privacy Officer. We will need to verify your identity before responding. Subject to any applicable exceptions, we will provide you with access to the personal information you request within a reasonable time and usually within 28 days.

Service Users or their representatives can modify or withdraw consent for Elle.Be.O to access their personal information at any time by contacting the manager of the care or service they are receiving.

HOW CAN YOU MAKE A COMPLAINT?
If you have a complaint about a suspected breach of the APPs, you should put your complaint in writing and send it to the Privacy Officer. We will review and respond within a reasonable timeframe. If you are not satisfied with our response, you can complain to the Office of the Australian Information Commissioner (OAIC) via www.oaic.gov.au.

PRIVACY OFFICER DETAILS
Email: info@ellebeo.com
Mail: PO BOX 961, LANE COVE 1595

UPDATES TO THIS POLICY
We may update this Policy from time to time by publishing the updated Policy on our website or app and, where appropriate, notifying users by email, in-app notice or other direct communication.

This Policy was last updated on 24 June 2026. The next review date is 24 December 2026.`;

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = "service" | "privacy";

interface TermsModalProps {
  onAccepted: () => void;
}

export function TermsModal({ onAccepted }: TermsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("service");
  const [serviceScrolled, setServiceScrolled] = useState(false);
  const [privacyScrolled, setPrivacyScrolled] = useState(false);
  const [agreeService, setAgreeService] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const canAccept = agreeService && agreePrivacy;

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      if (activeTab === "service") setServiceScrolled(true);
      else setPrivacyScrolled(true);
    }
  };

  const handleAccept = async () => {
    if (!canAccept || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/auth/accept-terms");
      onAccepted();
    } catch {
      setSubmitting(false);
    }
  };

  const currentScrolled = activeTab === "service" ? serviceScrolled : privacyScrolled;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: "90vh" }}
        >
          {/* Header */}
          <div className="bg-foreground text-offwhite px-8 py-6 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <ScrollText className="size-5 text-sage shrink-0" />
              <h2 className="font-serif text-2xl">Before you begin</h2>
            </div>
            <p className="text-offwhite/60 text-xs ml-8">
              Please read and accept our Service Agreement and Privacy Policy to continue.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            {(["service", "privacy"] as Tab[]).map((tab) => {
              const label = tab === "service" ? "Service Agreement" : "Privacy Policy";
              const done = tab === "service" ? agreeService : agreePrivacy;
              return (
                <button
                  key={tab}
                  onClick={() => switchTab(tab)}
                  className={`flex-1 py-3.5 text-[11px] uppercase tracking-[0.18em] flex items-center justify-center gap-2 transition-colors ${
                    activeTab === tab
                      ? "bg-background text-foreground border-b-2 border-foreground -mb-px"
                      : "text-taupe hover:text-foreground"
                  }`}
                >
                  {done && <Check className="size-3 text-sage" />}
                  {label}
                </button>
              );
            })}
          </div>

          {/* Document scroll area — single div, content swaps on tab change */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto px-8 py-6"
          >
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
              {activeTab === "service" ? RAW_SERVICE_AGREEMENT : RAW_PRIVACY_POLICY}
            </pre>
          </div>

          {/* Scroll-to-bottom hint */}
          {!currentScrolled && (
            <div className="shrink-0 px-8 py-2 bg-background border-t border-border text-center">
              <p className="text-[10px] text-taupe">Scroll to the end of the document to enable the checkbox</p>
            </div>
          )}

          {/* Footer — checkboxes + accept */}
          <div className="border-t border-border px-8 py-6 bg-background shrink-0 space-y-4">
            {/* Checkbox: Service Agreement */}
            <label className={`flex items-start gap-3 cursor-pointer group ${!serviceScrolled ? "opacity-40 pointer-events-none" : ""}`}>
              <div
                onClick={() => serviceScrolled && setAgreeService((v) => !v)}
                className={`size-5 rounded border shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                  agreeService ? "bg-foreground border-foreground" : "border-border group-hover:border-taupe"
                }`}
              >
                {agreeService && <Check className="size-3 text-white" />}
              </div>
              <span className="text-xs text-foreground/80 leading-relaxed">
                I have read and agree to the{" "}
                <span className="font-semibold text-foreground">Elle.Be.O Service Agreement</span>
                {!serviceScrolled && (
                  <span className="text-taupe"> — scroll to the end of the document to enable</span>
                )}
              </span>
            </label>

            {/* Checkbox: Privacy Policy */}
            <label className={`flex items-start gap-3 cursor-pointer group ${!privacyScrolled ? "opacity-40 pointer-events-none" : ""}`}>
              <div
                onClick={() => privacyScrolled && setAgreePrivacy((v) => !v)}
                className={`size-5 rounded border shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                  agreePrivacy ? "bg-foreground border-foreground" : "border-border group-hover:border-taupe"
                }`}
              >
                {agreePrivacy && <Check className="size-3 text-white" />}
              </div>
              <span className="text-xs text-foreground/80 leading-relaxed">
                I have read and agree to the{" "}
                <span className="font-semibold text-foreground">Elle.Be.O Privacy Policy</span>
                {!privacyScrolled && (
                  <span className="text-taupe"> — scroll to the end of the document to enable</span>
                )}
              </span>
            </label>

            {/* Accept button */}
            <button
              onClick={handleAccept}
              disabled={!canAccept || submitting}
              className="w-full bg-foreground text-offwhite py-4 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                "Saving…"
              ) : (
                <>
                  <ShieldCheck className="size-3.5" />
                  Accept & Continue
                </>
              )}
            </button>

            <p className="text-[10px] text-taupe/60 text-center">
              By accepting, you confirm you have read and agree to both documents. Your acceptance is recorded.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
