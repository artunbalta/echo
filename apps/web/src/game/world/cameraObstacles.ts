/** Analytic camera sweep against the same solid cylinders that stop the player.
 * Unlike spaced point tests, a thin trunk cannot fall between two camera samples.
 */
import type { Vec3 } from './followCamera';
export interface CameraCylinder { x: number; y: number; z: number; radius: number; height: number }
export function cylinderBoomLimit(anchor: Vec3, direction: Vec3, wanted: number, cylinders: readonly CameraCylinder[], clearance = .18): number {
  let limit = wanted;
  for (const c of cylinders) {
    const x = anchor[0]-c.x, z=anchor[2]-c.z;
    const radius=c.radius+clearance;
    const a=direction[0]**2+direction[2]**2;
    const b=2*(x*direction[0]+z*direction[2]);
    const offset=x*x+z*z-radius*radius;
    let enter=0, leave=wanted;
    if(a<1e-10) { if(offset>0) continue; }
    else {
      const discriminant=b*b-4*a*offset;
      if(discriminant<0) continue;
      const root=Math.sqrt(discriminant);
      enter=Math.max(enter,(-b-root)/(2*a)); leave=Math.min(leave,(-b+root)/(2*a));
    }
    const bottom=c.y-clearance, top=c.y+c.height+clearance;
    if(Math.abs(direction[1])<1e-10) { if(anchor[1]<bottom || anchor[1]>top) continue; }
    else {
      const t0=(bottom-anchor[1])/direction[1],t1=(top-anchor[1])/direction[1];
      enter=Math.max(enter,Math.min(t0,t1)); leave=Math.min(leave,Math.max(t0,t1));
    }
    if(enter<=leave && leave>=0 && enter<=limit) limit=Math.max(0,enter-.015);
  }
  return limit;
}
