import * as React from "react";
import { mount, ReactWrapper } from "enzyme";
import fetchMock from "jest-fetch-mock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { act } from "react-dom/test-utils";
import UserFeedback, {
  UserFeedbackProps,
  UserFeedbackState,
} from "../../src/user/UserFeedback";
import GlobalAppContext, {
  GlobalAppContextT,
} from "../../src/utils/GlobalAppContext";
import APIService from "../../src/utils/APIService";
import * as userFeedbackProps from "../__mocks__/userFeedbackProps.json";
import * as userFeedbackAPIResponse from "../__mocks__/userFeedbackAPIResponse.json";
import ListenCard from "../../src/listens/ListenCard";
import { waitForComponentToPaint } from "../test-utils";

const { totalCount, user, feedback, youtube, spotify } = userFeedbackProps;

const initialRecordingFeedbackMap = {
  "8aa379ad-852e-4794-9c01-64959f5d0b17": 1,
  "edfa0bb9-a58c-406c-9f7c-f16741443f9c": 1,
  "20059ffb-1615-4712-8235-a12840fb156e": 1,
  "da31a1d9-267a-4bad-bcd7-c6d2b1ab6539": 1,
  "75f7f913-8cb5-45b6-b154-7633ecec61ad": 1,
  "3fc76ff9-1985-4b83-9b81-e3a840e9d8fb": 1,
  "96e83a2d-9d75-4a93-8061-36ed2174a84b": 1,
  "ac15219d-5f2d-47d4-ba9f-7f8259e67e23": 1,
  "37c605a6-8fac-4c47-bdb6-ed12b4239a01": 1,
  "830ee421-c28b-4ff0-abfb-e43caa189983": 1,
  "ae9456a9-7477-419f-9aad-691b2f84e378": 1,
  "71d8053a-845d-4d68-a8e4-0eec52cc77bd": 1,
  "eacfa55b-3f70-44c1-a2f3-6e27ea9f0187": 1,
  "4704b20d-2377-45de-aa87-089de93c2aaf": 1,
  "15497abd-f41c-4a1e-8bf6-e00fffb11f79": 1,
};
// Typescript does not like the "score“ field
const typedFeedback = feedback as FeedbackResponseWithTrackMetadata[];

const props = {
  totalCount,
  user,
  feedback: typedFeedback,
  youtube,
  spotify,
  newAlert: () => {},
  updateRecordingToPin: () => {},
};

// Create a new instance of GlobalAppContext
const mountOptions: { context: GlobalAppContextT } = {
  context: {
    APIService: new APIService("foo"),
    youtubeAuth: youtube as YoutubeUser,
    spotifyAuth: spotify as SpotifyUser,
    currentUser: { auth_token: "lalala", name: "pikachu" },
  },
};
const mountOptionsWithoutUser: { context: GlobalAppContextT } = {
  context: {
    ...mountOptions.context,
    currentUser: {} as ListenBrainzUser,
  },
};

const mockDate = new Date("2021-05-19");
const fakeDateNow = jest
  .spyOn(global.Date, "now")
  .mockImplementation(() => mockDate.getTime());

// Font Awesome generates a random hash ID for each icon everytime.
// Mocking Math.random() fixes this
// https://github.com/FortAwesome/react-fontawesome/issues/194#issuecomment-627235075
jest.spyOn(global.Math, "random").mockImplementation(() => 0);

describe("UserFeedback", () => {
  let wrapper:
    | ReactWrapper<UserFeedbackProps, UserFeedbackState, UserFeedback>
    | undefined;
  beforeEach(() => {
    wrapper = undefined;
  });
  afterEach(() => {
    if (wrapper) {
      /* Unmount the wrapper at the end of each test, otherwise react-dom throws errors
        related to async lifecycle methods run against a missing dom 'document'.
        See https://github.com/facebook/react/issues/15691
      */
      wrapper.unmount();
    }
  });

  it("renders correctly", () => {
    wrapper = mount<UserFeedback>(<UserFeedback {...props} />, mountOptions);
    expect(wrapper.html()).toMatchSnapshot();
    fakeDateNow.mockRestore();
  });

  it("loads user feedback from props if logged-in user on their profile", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider
        value={{
          ...mountOptions.context,
          // Same user as in page props
          currentUser: {
            name: "mr_monkey",
            id: 1,
            auth_token: "IHaveSeenTheFnords",
          },
        }}
      >
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const instance = wrapper.instance();
    const loadFeedbackSpy = jest.spyOn(instance, "loadFeedback");
    await waitForComponentToPaint(wrapper);

    // We don't call loadFeedback because we already have the feedback scores in props
    expect(loadFeedbackSpy).not.toHaveBeenCalled();
    expect(instance.state.recordingMsidFeedbackMap).toEqual(
      initialRecordingFeedbackMap
    );
  });

  it("loads user feedback from API for logged-in user", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptions.context}>
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const instance = wrapper.instance();
    const loadFeedbackSpy = jest.spyOn(instance, "loadFeedback");
    const apiGetFeedbackSpy = jest
      .spyOn(instance.context.APIService, "getFeedbackForUserForRecordings")
      .mockResolvedValueOnce({
        feedback: [
          { recording_msid: "some-uuid", score: 1 },
          { recording_msid: "some-other-uuid", score: -1 },
        ],
      });
    instance.componentDidMount();
    await waitForComponentToPaint(wrapper);
    expect(loadFeedbackSpy).toHaveBeenCalledTimes(1);
    expect(apiGetFeedbackSpy).toHaveBeenCalledWith(
      "pikachu",
      props.feedback
        .map((item) => item.recording_msid)
        .filter(Boolean)
        .join(","),
      props.feedback
        .map((item) => item.recording_mbid)
        .filter(Boolean)
        .join(",")
    );

    expect(instance.state.recordingMsidFeedbackMap).toEqual({
      "some-uuid": 1,
      "some-other-uuid": -1,
    });
  });

  it("loadFeedback does not do anything if no user is logged in", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptionsWithoutUser.context}>
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const instance = wrapper.instance();
    await waitForComponentToPaint(wrapper);
    const getFeedbackSpy = jest.spyOn(instance, "getFeedback");
    const apiGetFeedbackSpy = jest.spyOn(
      instance.context.APIService,
      "getFeedbackForUserForRecordings"
    );
    expect(instance.context.currentUser).toEqual({});
    instance.loadFeedback();
    await waitForComponentToPaint(wrapper);
    expect(getFeedbackSpy).toHaveBeenCalledTimes(1);

    expect(apiGetFeedbackSpy).not.toHaveBeenCalled();
  });

  it("renders ListenCard items for each feedback item", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptions.context}>
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const listens = wrapper.find(ListenCard);
    expect(listens).toHaveLength(15);
  });

  it("does not render ListenCard items for feedback item without track name", async () => {
    const withoutTrackNameProps = {
      ...props,
      feedback: [
        {
          created: 1631778335,
          recording_msid: "8aa379ad-852e-4794-9c01-64959f5d0b17",
          score: 1,
          track_metadata: {
            additional_info: {
              recording_mbid: "9812475d-c800-4f29-8a9a-4ac4af4b4dfd",
              release_mbid: "17276c50-dd38-4c62-990e-186ef0ff36f4",
            },
            artist_name: "Hobocombo",
            release_name: "",
            track_name: "Bird's lament",
          },
          user_id: "mr_monkey",
        },
        {
          created: 1631553259,
          recording_msid: "edfa0bb9-a58c-406c-9f7c-f16741443f9c",
          score: 1,
          track_metadata: null,
          user_id: "mr_monkey",
        },
      ],
    };
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptions.context}>
        <UserFeedback {...(withoutTrackNameProps as UserFeedbackProps)} />
      </GlobalAppContext.Provider>
    );
    const listens = wrapper.find(ListenCard);
    expect(listens).toHaveLength(1);
  });

  it("shows feedback on the ListenCards according to recordingFeedbackMap", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptions.context}>
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const instance = wrapper.instance();
    await act(() => {
      instance.setState({
        recordingMsidFeedbackMap: {
          "8aa379ad-852e-4794-9c01-64959f5d0b17": 1,
          "edfa0bb9-a58c-406c-9f7c-f16741443f9c": 0,
          "20059ffb-1615-4712-8235-a12840fb156e": -1,
        },
      });
    });
    await waitForComponentToPaint(wrapper);
    const listens = wrapper.find(ListenCard);
    // Score = 1 (loved) for first item
    const firstListenCard = listens.at(0).find(".listen-controls").first();
    expect(
      firstListenCard
        .find("[title='Love']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("loved")
    ).toBeTruthy();
    // Score = 0 (neutral) for second item
    const secondListenCard = listens.at(1).find(".listen-controls").first();
    expect(
      secondListenCard
        .find("[title='Love']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("loved")
    ).toBeFalsy();
    expect(
      secondListenCard
        .find("[title='Hate']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("hated")
    ).toBeFalsy();
    // Score = -1 (hated) for third item
    const thirdListenCard = listens.at(2).find(".listen-controls").first();
    expect(
      thirdListenCard
        .find("[title='Hate']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("hated")
    ).toBeTruthy();
    // No score (neutral) for fourth item
    const fourthListenCard = listens.at(3).find(".listen-controls").first();
    expect(
      fourthListenCard
        .find("[title='Love']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("loved")
    ).toBeFalsy();
    expect(
      fourthListenCard
        .find("[title='Hate']")
        .first()
        .find(FontAwesomeIcon)
        .first()
        .hasClass("hated")
    ).toBeFalsy();
  });
  it("updates recordingFeedbackMap when clicking on a feedback button", async () => {
    wrapper = mount<UserFeedback>(
      <GlobalAppContext.Provider value={mountOptions.context}>
        <UserFeedback {...props} />
      </GlobalAppContext.Provider>
    );
    const instance = wrapper.instance();
    const listens = wrapper.find(ListenCard);
    const APIsubmitFeedbackSpy = jest
      .spyOn(instance.context.APIService, "submitFeedback")
      .mockResolvedValue(200);
    const updateFeedbackSpy = jest.spyOn(instance, "updateFeedback");

    await act(() => {
      instance.setState({
        recordingMsidFeedbackMap: {
          ...instance.state.recordingMsidFeedbackMap,
          "8aa379ad-852e-4794-9c01-64959f5d0b17": 0,
        },
      });
    });

    expect(instance.state.recordingMsidFeedbackMap).toEqual({
      "8aa379ad-852e-4794-9c01-64959f5d0b17": 0,
    });
    const firstListenCard = listens.first();

    const loveButton = firstListenCard
      .find(".listen-controls")
      .first()
      .find("[title='Love']")
      .first();

    // simulate clicking on "love" button
    loveButton.simulate("click");
    await waitForComponentToPaint(wrapper);

    expect(APIsubmitFeedbackSpy).toHaveBeenCalledWith(
      "lalala",
      1,
      "8aa379ad-852e-4794-9c01-64959f5d0b17",
      "9812475d-c800-4f29-8a9a-4ac4af4b4dfd"
    );
    expect(updateFeedbackSpy).toHaveBeenCalledWith(
      "9812475d-c800-4f29-8a9a-4ac4af4b4dfd",
      1,
      "8aa379ad-852e-4794-9c01-64959f5d0b17"
    );

    expect(instance.state.recordingMsidFeedbackMap).toEqual({
      "8aa379ad-852e-4794-9c01-64959f5d0b17": 1,
    });
  });
  describe("getFeedbackItemsFromAPI", () => {
    it("calls the API with the right parameters", async () => {
      wrapper = mount<UserFeedback>(
        <GlobalAppContext.Provider value={mountOptions.context}>
          <UserFeedback {...props} />
        </GlobalAppContext.Provider>
      );
      const instance = wrapper.instance();
      const apiGetFeedbackSpy = jest.spyOn(
        instance.context.APIService,
        "getFeedbackForUser"
      );

      await instance.getFeedbackItemsFromAPI(1, false);
      expect(apiGetFeedbackSpy).toHaveBeenCalledTimes(1);
      expect(apiGetFeedbackSpy).toHaveBeenCalledWith("mr_monkey", 0, 25, 1);
      apiGetFeedbackSpy.mockClear();
    });

    it("sets the state, loads feedback for user and updates browser history", async () => {
      wrapper = mount<UserFeedback>(
        <GlobalAppContext.Provider value={mountOptions.context}>
          <UserFeedback {...props} />
        </GlobalAppContext.Provider>
      );
      const instance = wrapper.instance();
      const loadFeedbackSpy = jest.spyOn(instance, "loadFeedback");
      await waitForComponentToPaint(wrapper);

      // Initially set to 1 page (15 listens), after API response should be 2 pages
      expect(instance.state.maxPage).toEqual(1);
      expect(instance.state.feedback).not.toEqual(
        userFeedbackAPIResponse.feedback
      );

      fetchMock.mockResponseOnce(JSON.stringify(userFeedbackAPIResponse));
      await instance.getFeedbackItemsFromAPI(1, true);
      await waitForComponentToPaint(wrapper);

      expect(instance.state.feedback).toEqual(userFeedbackAPIResponse.feedback);
      expect(instance.state.maxPage).toEqual(2);
      expect(instance.state.selectedFeedbackScore).toEqual(1);
      expect(instance.state.loading).toEqual(false);

      expect(loadFeedbackSpy).toHaveBeenCalledTimes(1);
    });
  });
});
