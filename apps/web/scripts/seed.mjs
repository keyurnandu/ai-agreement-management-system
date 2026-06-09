import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seed a few accounts spanning roles so RBAC can be exercised immediately.
const USERS = [
  { email: "admin@local.test", name: "Local Admin", role: "ADMIN", password: "Admin123!" },
  { email: "manager@local.test", name: "Procurement Manager", role: "MANAGER", password: "Manager123!" },
  { email: "viewer@local.test", name: "Viewer", role: "VIEWER", password: "Viewer123!" },
];

const CLAUSES = [
  {
    key: "parties",
    title: "Parties",
    category: "preamble",
    body: 'This Agreement is entered into between {{party_a}} ("Party A") and {{party_b}} ("Party B"), each a "Party".',
  },
  {
    key: "purpose",
    title: "Purpose",
    category: "general",
    body: 'The Parties wish to evaluate {{purpose}} (the "Purpose") and may disclose confidential information to one another.',
  },
  {
    key: "confidentiality",
    title: "Confidentiality",
    category: "core",
    body: "Each Party shall keep the other Party's Confidential Information secret and use it solely for the Purpose.",
    fallbacks: [
      {
        label: "One-way",
        text: "The Receiving Party shall keep the Disclosing Party's Confidential Information secret and use it solely for the Purpose.",
        riskLevel: "low",
      },
    ],
  },
  {
    key: "term",
    title: "Term",
    category: "core",
    body: "This Agreement commences on {{effective_date}} and remains in effect for {{term_months}} months.",
  },
  {
    key: "governing-law",
    title: "Governing Law",
    category: "boilerplate",
    body: "This Agreement is governed by and construed in accordance with the laws of {{governing_law}}.",
    fallbacks: [
      { label: "Delaware", text: "This Agreement is governed by the laws of the State of Delaware, USA.", riskLevel: "low" },
      { label: "India", text: "This Agreement is governed by the laws of India.", riskLevel: "low" },
    ],
  },
];

const TEMPLATE = {
  key: "mutual-nda",
  name: "Mutual NDA",
  description: "A simple mutual non-disclosure agreement assembled from the clause library.",
  variables: [
    { key: "party_a", label: "Party A (your company)", type: "text", required: true },
    { key: "party_b", label: "Party B (counterparty)", type: "text", required: true },
    { key: "purpose", label: "Purpose of disclosure", type: "text", required: true },
    { key: "effective_date", label: "Effective date", type: "date", required: true },
    { key: "term_months", label: "Term (months)", type: "number", required: true },
    { key: "governing_law", label: "Governing law", type: "text", required: true },
  ],
  clauseOrder: ["parties", "purpose", "confidentiality", "term", "governing-law"],
};

const ATTRIBUTES = [
  { key: "effective_date", label: "Effective Date", type: "DATE", prompt: "Extract the effective or commencement date of this agreement; return an ISO date.", scope: "BOTH" },
  { key: "governing_law", label: "Governing Law", type: "TEXT", prompt: "Which jurisdiction's law governs this agreement?", scope: "BOTH" },
  { key: "term_months", label: "Term (months)", type: "NUMBER", prompt: "What is the duration/term of this agreement, in months?", scope: "BOTH" },
  { key: "auto_renewal", label: "Auto-renewal", type: "BOOLEAN", prompt: "Does this agreement automatically renew? Answer true or false.", scope: "BOTH" },
];

async function seedAuthoring() {
  console.log("Seeding clause library + template + attributes:");
  const idByKey = {};
  for (const c of CLAUSES) {
    const row = await prisma.clauseLibraryEntry.upsert({
      where: { key: c.key },
      update: { title: c.title, category: c.category ?? null, body: c.body, fallbacks: c.fallbacks ?? undefined, active: true },
      create: { key: c.key, title: c.title, category: c.category ?? null, body: c.body, fallbacks: c.fallbacks ?? undefined },
    });
    idByKey[c.key] = row.id;
  }
  const tpl = await prisma.template.upsert({
    where: { key: TEMPLATE.key },
    update: { name: TEMPLATE.name, description: TEMPLATE.description, variables: TEMPLATE.variables, active: true },
    create: { key: TEMPLATE.key, name: TEMPLATE.name, description: TEMPLATE.description, variables: TEMPLATE.variables },
  });
  await prisma.templateClause.deleteMany({ where: { templateId: tpl.id } });
  await prisma.templateClause.createMany({
    data: TEMPLATE.clauseOrder.map((k, i) => ({ templateId: tpl.id, clauseId: idByKey[k], order: i + 1, required: true })),
  });
  for (const a of ATTRIBUTES) {
    await prisma.attributeDefinition.upsert({
      where: { key: a.key },
      update: { label: a.label, type: a.type, prompt: a.prompt, scope: a.scope, active: true },
      create: { key: a.key, label: a.label, type: a.type, prompt: a.prompt, scope: a.scope },
    });
  }
  console.log(`  - ${CLAUSES.length} clauses, template '${TEMPLATE.key}', ${ATTRIBUTES.length} attribute defs`);
}

async function main() {
  console.log("Seeding users:");
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, isActive: true },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, isActive: true },
    });
    console.log(`  - ${u.role.padEnd(8)} ${u.email}  (password: ${u.password})`);
  }
  await seedAuthoring();
  console.log("\nSeed complete. Sign in at http://localhost:3000/login");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
