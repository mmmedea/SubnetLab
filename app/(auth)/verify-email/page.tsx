import VerifyEmailOtp from "@/components/auth/VerifyEmailOtp";
export default async function Page({searchParams}:{searchParams:Promise<{next?:string;challenge?:string}>}) {
 const params=await searchParams;
 return <VerifyEmailOtp next={params.next??"/dashboard"} challenge={params.challenge??""}/>;
}
