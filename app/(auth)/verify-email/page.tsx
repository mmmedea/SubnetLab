import VerifyEmailOtp from "@/components/auth/VerifyEmailOtp";
export default async function Page({searchParams}:{searchParams:Promise<{next?:string;challenge?:string;event?:string}>}) {
 const params=await searchParams;
 const event=params.event==="password_set"||params.event==="password_changed"?params.event:"login";
 return <VerifyEmailOtp next={params.next??"/dashboard"} challenge={params.challenge??""} event={event}/>;
}
