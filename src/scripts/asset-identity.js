export function getPrototypeActor(asset) {
    if (!(asset instanceof foundry.data.PrototypeToken)) return null;
    return game.actors.find(actor => actor.prototypeToken === asset) ?? null;
}
