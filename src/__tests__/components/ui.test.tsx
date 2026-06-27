import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("applies the default variant data-slot", () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText("Tag")).toHaveAttribute("data-slot", "badge");
  });

  it("supports the secondary variant class", () => {
    render(<Badge variant="secondary">Sec</Badge>);
    expect(screen.getByText("Sec").className).toContain("bg-secondary");
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Badge asChild>
        <a href="/x">Link</a>
      </Badge>
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toHaveAttribute("href", "/x");
  });
});

describe("Button", () => {
  it("renders text and is a button by default", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });

  it("fires onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes variant and size via data attributes", () => {
    render(
      <Button variant="destructive" size="lg">
        Danger
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Danger" });
    expect(btn).toHaveAttribute("data-variant", "destructive");
    expect(btn).toHaveAttribute("data-size", "lg");
  });

  it("renders as a child element (anchor) when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/go">Go</a>
      </Button>
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute(
      "href",
      "/go"
    );
  });
});

describe("Card", () => {
  it("renders the full card composition", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("sets the card data-slot", () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText("Card body")).toHaveAttribute(
      "data-slot",
      "card"
    );
  });
});

describe("Dialog", () => {
  it("does not show content until the trigger is clicked", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Dialog</DialogTitle>
            <DialogDescription>Some details</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByText("My Dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("My Dialog")).toBeInTheDocument();
    });
    expect(screen.getByText("Some details")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders open content when controlled open", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Controlled</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Controlled")).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("renders and reflects controlled value", () => {
    const onChange = vi.fn();
    render(
      <Input value="hello" onChange={onChange} placeholder="type here" />
    );
    const input = screen.getByPlaceholderText("type here") as HTMLInputElement;
    expect(input.value).toBe("hello");
    expect(input).toHaveAttribute("data-slot", "input");
  });

  it("calls onChange when typed into", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="p" />);
    fireEvent.change(screen.getByPlaceholderText("p"), {
      target: { value: "abc" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("respects the type attribute", () => {
    render(<Input type="email" placeholder="email" />);
    expect(screen.getByPlaceholderText("email")).toHaveAttribute(
      "type",
      "email"
    );
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="d" />);
    expect(screen.getByPlaceholderText("d")).toBeDisabled();
  });
});

describe("Label", () => {
  it("renders text and associates with a control via htmlFor", () => {
    render(
      <>
        <Label htmlFor="field">My Label</Label>
        <input id="field" />
      </>
    );
    const label = screen.getByText("My Label");
    expect(label).toHaveAttribute("for", "field");
  });
});

describe("Progress", () => {
  it("renders a progressbar and reflects value in the indicator transform", () => {
    render(<Progress value={40} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    const indicator = bar.firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-60%)");
  });

  it("defaults to 0% when no value provided", () => {
    render(<Progress />);
    const bar = screen.getByRole("progressbar");
    const indicator = bar.firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-100%)");
  });
});

describe("Select", () => {
  it("shows the placeholder and opens options on click", async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="fruit">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole("combobox", { name: "fruit" });
    expect(trigger).toHaveTextContent("Pick one");

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Apple")).toBeInTheDocument();
    });
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });

  it("renders a controlled value", () => {
    render(
      <Select value="banana">
        <SelectTrigger aria-label="fruit2">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(
      screen.getByRole("combobox", { name: "fruit2" })
    ).toHaveTextContent("Banana");
  });
});

describe("Skeleton", () => {
  it("renders with the animate-pulse class", () => {
    render(<Skeleton data-testid="sk" />);
    const sk = screen.getByTestId("sk");
    expect(sk.className).toContain("animate-pulse");
  });
});

describe("Slider", () => {
  it("renders a slider thumb with the controlled value", () => {
    render(<Slider value={[25]} min={0} max={100} aria-label="vol" />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "25");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
  });

  it("renders one thumb per value", () => {
    render(<Slider value={[20, 80]} min={0} max={100} />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });
});

describe("Switch", () => {
  it("toggles checked state on click", () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="toggle" />);
    const sw = screen.getByRole("switch", { name: "toggle" });
    expect(sw).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects a controlled checked state", () => {
    render(<Switch checked aria-label="on" onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "on" })).toHaveAttribute(
      "data-state",
      "checked"
    );
  });

  it("can be disabled", () => {
    render(<Switch disabled aria-label="dis" />);
    expect(screen.getByRole("switch", { name: "dis" })).toBeDisabled();
  });
});

describe("Tabs", () => {
  it("shows the default tab content and switches on tab click", async () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByText("First panel")).toBeInTheDocument();
    expect(screen.queryByText("Second panel")).not.toBeInTheDocument();

    const tabTwo = screen.getByRole("tab", { name: "Two" });
    fireEvent.pointerDown(tabTwo, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(tabTwo, { button: 0, ctrlKey: false });
    fireEvent.click(tabTwo);

    await waitFor(() => {
      expect(screen.getByText("Second panel")).toBeInTheDocument();
    });
    expect(screen.queryByText("First panel")).not.toBeInTheDocument();
  });
});

describe("Textarea", () => {
  it("renders and reflects controlled value", () => {
    render(
      <Textarea value="content" onChange={() => {}} placeholder="notes" />
    );
    const ta = screen.getByPlaceholderText("notes") as HTMLTextAreaElement;
    expect(ta.value).toBe("content");
  });

  it("calls onChange when typed into", () => {
    const onChange = vi.fn();
    render(<Textarea onChange={onChange} placeholder="ta" />);
    fireEvent.change(screen.getByPlaceholderText("ta"), {
      target: { value: "x" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("can be disabled", () => {
    render(<Textarea disabled placeholder="t" />);
    expect(screen.getByPlaceholderText("t")).toBeDisabled();
  });
});

describe("Tooltip", () => {
  it("renders the trigger and shows content on hover", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByText("Hover me");
    expect(trigger).toBeInTheDocument();

    fireEvent.focus(trigger);

    await waitFor(() => {
      expect(screen.getAllByText("Tip text").length).toBeGreaterThan(0);
    });
  });
});
