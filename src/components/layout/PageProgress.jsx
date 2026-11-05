import {motion,useReducedMotion,useScroll,useSpring} from 'framer-motion';

// Local visual feedback only. No events or analytics are sent.
export default function PageProgress(){
  const {scrollYProgress}=useScroll();
  const smooth=useSpring(scrollYProgress,{stiffness:180,damping:35,mass:0.2});
  const reduceMotion=useReducedMotion();
  return <motion.div aria-hidden="true" style={{scaleX:reduceMotion?scrollYProgress:smooth,transformOrigin:'0% 50%'}} className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 bg-zinc-800/50 dark:bg-zinc-200/50"/>;
}
