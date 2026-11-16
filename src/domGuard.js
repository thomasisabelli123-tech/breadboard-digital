// Browser translators (Chrome Translate, Edge, extensions) wrap text nodes in <font> tags and move them around. React then tries to
// remove/insert a node that is no longer a child of the expected parent and throws
//   NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node
// which unmounts the UI ("black screen"). These two patches make those calls tolerant instead (well-known workaround, facebook/react#11538).
if (typeof Node === 'function' && Node.prototype && !Node.prototype.__bbdGuard) {
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChildSafe(child) {
    if (child && child.parentNode !== this) {
      if (child.parentNode) { try { return origRemove.call(child.parentNode, child); } catch (_) { /* ignore */ } }
      return child;
    }
    return origRemove.call(this, child);
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBeforeSafe(newNode, refNode) {
    if (refNode && refNode.parentNode !== this) {
      // the reference node was moved by the translator: append instead of throwing
      return origInsert.call(this, newNode, null);
    }
    return origInsert.call(this, newNode, refNode);
  };
  Node.prototype.__bbdGuard = true;
}
