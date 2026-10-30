import {Storyboard} from '../../../../../components/storyboard';
export default async function Page({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <Storyboard projectId={projectId}/>;}
