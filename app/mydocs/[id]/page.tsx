import { ProjectDocumentPage } from "@/features/mydocs/project-document-page";

export const metadata = { title: "项目文档 | Plum Admin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProjectDocumentPage id={(await params).id} />;
}
