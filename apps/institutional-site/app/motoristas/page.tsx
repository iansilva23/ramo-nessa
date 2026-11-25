import type { Metadata } from 'next';
import TrainingCenter from './training-center';
import './training.css';
export const metadata:Metadata={title:'Central do Motorista | Ramo Nessa',description:'Videoaulas e orientações para motoristas do Ramo Nessa.',robots:{index:false,follow:false}};
export default function Page(){return <TrainingCenter/>;}
