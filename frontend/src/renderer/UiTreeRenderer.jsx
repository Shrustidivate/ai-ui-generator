import React from "react";
import { Button, Card, Input, Table, Modal, Sidebar, Navbar, Chart } from "../ui-kit/index.js";

const componentMap = {
  Button,
  Card,
  Input,
  Table,
  Modal,
  Sidebar,
  Navbar,
  Chart
};

function renderNode(node, keyPrefix = "node") {
  if (node == null) {
    return null;
  }

  if (typeof node === "string") {
    return node;
  }

  if (node.type === "text") {
    return node.text || "";
  }

  const { type, props = {}, children = [] } = node;
  const sanitizedProps = { ...props };
  delete sanitizedProps.className;
  delete sanitizedProps.style;

  const renderedChildren = Array.isArray(children)
    ? children.map((child, index) => (
        <React.Fragment key={`${keyPrefix}-${index}`}>{renderNode(child, `${keyPrefix}-${index}`)}</React.Fragment>
      ))
    : null;

  if (type === "div" || type === "section") {
    return React.createElement(type, { key: keyPrefix }, renderedChildren);
  }

  const Component = componentMap[type];
  if (!Component) {
    return null;
  }

  return (
    <Component key={keyPrefix} {...sanitizedProps}>
      {renderedChildren}
    </Component>
  );
}

export default function UiTreeRenderer({ plan }) {
  if (!plan || !plan.tree) {
    return null;
  }

  return <>{renderNode(plan.tree)}</>;
}