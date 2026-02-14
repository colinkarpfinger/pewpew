import RAPIER from '@dimforge/rapier2d-deterministic-compat';

async function main() {
  await RAPIER.init();
  
  const world = new RAPIER.World({ x: 0, y: 0 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-8, -48));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.5), body);
  
  // Step the world once to update the query pipeline
  world.step();
  
  const ball = new RAPIER.Ball(0.1);
  
  let found = false;
  world.intersectionsWithShape({ x: -8, y: -48 }, 0, ball, (c) => {
    found = true;
    const contact = c.contactShape(ball, { x: -8, y: -48 }, 0, 0);
    console.log('  Contact:', contact ? { dist: contact.distance, n1: {x: contact.normal1.x, y: contact.normal1.y} } : null);
    return true;
  });
  console.log('Center (-8,-48):', found);
  
  found = false;
  world.intersectionsWithShape({ x: -8, y: -49 }, 0, ball, (c) => {
    found = true;
    return true;
  });
  console.log('Outside (-8,-49):', found);
  
  // Test ray cast
  const ray = new RAPIER.Ray({ x: -8, y: -52 }, { x: 0, y: 1 });
  const hit = world.castRay(ray, 10, true);
  console.log('Ray from (-8,-52) up, hit:', hit ? { toi: hit.timeOfImpact } : null);
  
  world.free();
}

main();
