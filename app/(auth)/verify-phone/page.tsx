import VerifyPhone from "@/components/auth/VerifyPhone";

export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}) {
 const params=await searchParams;
 return <VerifyPhone next={params.next??"/dashboard"}/>;
}
