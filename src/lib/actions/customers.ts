"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { serializeCustomer } from "@/lib/serialize";

export async function listCustomers() {
  const session = await requireSession();
  const customers = await prisma.customer.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
  return customers.map(serializeCustomer);
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export async function createCustomer(input: CustomerInput) {
  const session = await requireSession();
  const parsed = customerSchema.parse(input);
  const customer = await prisma.customer.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      phone: parsed.phone,
      creditLimit: parsed.creditLimit,
    },
  });
  revalidatePath("/customers");
  revalidatePath("/pos");
  return serializeCustomer(customer);
}
