import { format } from "date-fns";
import { getIndentFormData, listIndents } from "@/lib/actions/indents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IndentRequestForm } from "@/components/indents/indent-request-form";
import { IndentApprovalQueue } from "@/components/indents/indent-approval-queue";

export default async function IndentsPage() {
  const [formData, indents] = await Promise.all([getIndentFormData(), listIndents()]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Indents</h1>
      {formData.isApprover ? (
        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">Approval queue</TabsTrigger>
            <TabsTrigger value="request">New indent</TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="pt-4">
            <IndentApprovalQueue initialIndents={indents} />
          </TabsContent>
          <TabsContent value="request" className="pt-4">
            <IndentRequestForm wards={formData.wards} items={formData.items} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6">
          <IndentRequestForm wards={formData.wards} items={formData.items} />
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your ward&apos;s recent indents</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ward</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No indents yet.
                    </TableCell>
                  </TableRow>
                )}
                {indents.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.wardName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.items.map((l) => `${l.itemName} ×${l.qtyRequested}`).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{i.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(i.createdAt, "dd MMM, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
