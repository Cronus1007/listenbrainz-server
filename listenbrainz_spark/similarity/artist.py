from datetime import datetime, date, time, timedelta

from more_itertools import chunked

import listenbrainz_spark
from listenbrainz_spark import config
from listenbrainz_spark.path import RECORDING_LENGTH_DATAFRAME, ARTIST_CREDIT_MBID_DATAFRAME
from listenbrainz_spark.stats import run_query
from listenbrainz_spark.utils import get_listens_from_dump


RECORDINGS_PER_MESSAGE = 10000
# the duration value in seconds to use for track whose duration data in not available in MB
DEFAULT_TRACK_LENGTH = 180


def build_sessioned_index(listen_table, metadata_table, artist_credit_table, session, max_contribution, threshold, limit, _filter, skip_threshold):
    # TODO: Handle case of unmatched recordings breaking sessions!
    return f"""
            WITH listens AS (
                 SELECT user_id
                      , BIGINT(listened_at)
                      , CAST(COALESCE(r.length / 1000, {DEFAULT_TRACK_LENGTH}) AS BIGINT) AS duration
                      , artist_credit_mbids
                      , explode(artist_credit_mbids) AS artist_mbid
                   FROM {listen_table} l
              LEFT JOIN {metadata_table} r
                  USING (recording_mbid)
                  WHERE l.recording_mbid IS NOT NULL
            ), ordered AS (
                SELECT user_id
                     , listened_at
                     , listened_at - LAG(listened_at, 1) OVER w - LAG(duration, 1) OVER w AS difference
                     , artist_credit_mbids
                     , artist_mbid
                  FROM listens
                WINDOW w AS (PARTITION BY user_id ORDER BY listened_at)
            ), sessions AS (
                SELECT user_id
                     -- spark doesn't support window aggregate functions with FILTER clause
                     , COUNT_IF(difference > {session}) OVER w AS session_id
                     , LEAD(difference, 1) OVER w < {skip_threshold} AS skipped
                     , artist_credit_mbids
                     , artist_mbid
                  FROM ordered
                WINDOW w AS (PARTITION BY user_id ORDER BY listened_at)
            ), sessions_filtered AS (
                SELECT user_id
                     , session_id
                     , artist_credit_mbids
                     , artist_mbid
                     , concat_ws(",", artist_credit_mbids) AS artist_credit_mbids_str
                  FROM sessions
                 WHERE NOT skipped    
            ), user_grouped_mbids AS (
                SELECT user_id
                     , IF(s1.artist_mbid < s2.artist_mbid, s1.artist_mbid, s2.artist_mbid) AS lexical_mbid0
                     , IF(s1.artist_mbid > s2.artist_mbid, s1.artist_mbid, s2.artist_mbid) AS lexical_mbid1
                  FROM sessions_filtered s1
                  JOIN sessions_filtered s2
                 USING (user_id, session_id)
                 WHERE s1.artist_mbid != s2.artist_mbid
                   AND s1.artist_credit_mbids != s2.artist_credit_mbids
            ), user_contribtion_mbids AS (
                SELECT user_id
                     , lexical_mbid0 AS mbid0
                     , lexical_mbid1 AS mbid1
                     , LEAST(COUNT(*), {max_contribution}) AS part_score
                  FROM user_grouped_mbids
              GROUP BY user_id
                     , lexical_mbid0
                     , lexical_mbid1
            ), thresholded_mbids AS (
                SELECT mbid0
                     , mbid1
                     , SUM(part_score) AS score
                  FROM user_contribtion_mbids
              GROUP BY mbid0
                     , mbid1  
                HAVING score > {threshold}
            ), ranked_mbids AS (
                SELECT mbid0
                     , mbid1
                     , score
                     , rank() OVER w AS rank
                  FROM thresholded_mbids
                WINDOW w AS (PARTITION BY mbid0 ORDER BY score DESC)     
            )   SELECT mbid0
                     , mbid1
                     , score
                  FROM ranked_mbids
                 WHERE rank <= {limit}   
    """


def main(days, session, contribution, threshold, limit, filter_artist_credit, skip):
    """ Generate similar artists based on user listening sessions.

    Args:
        days: the number of days of listens to consider for calculating listening sessions
        session: the max time difference between two listens in a listening session
        contribution: the max contribution a user's listens can make to a recording pair's similarity score
        threshold: the minimum similarity score for two recordings to be considered similar
        limit: the maximum number of similar recordings to request for a given recording
            (this limit is instructive only, upto 2x number of recordings may be returned)
        filter_artist_credit: whether to filter out tracks by same artist from a listening session
        skip: the minimum threshold in seconds to mark a listen as skipped. we cannot just mark a negative difference
            as skip because there may be a difference in track length in MB and music services and also issues in
            timestamping listens.
    """
    to_date = datetime.combine(date.today(), time.min)
    from_date = to_date + timedelta(days=-days)

    table = "artist_similarity_listens"
    metadata_table = "recording_length"
    artist_credit_table = "artist_credit"

    get_listens_from_dump(from_date, to_date).createOrReplaceTempView(table)

    metadata_df = listenbrainz_spark.sql_context.read.parquet(config.HDFS_CLUSTER_URI + RECORDING_LENGTH_DATAFRAME)
    metadata_df.createOrReplaceTempView(metadata_table)

    artist_credit_df = listenbrainz_spark.sql_context.read.parquet(config.HDFS_CLUSTER_URI + ARTIST_CREDIT_MBID_DATAFRAME)
    artist_credit_df.createOrReplaceTempView(artist_credit_table)

    skip_threshold = -skip
    query = build_sessioned_index(table, metadata_table, artist_credit_table, session, contribution, threshold, limit, filter_artist_credit, skip_threshold)
    data = run_query(query).toLocalIterator()

    algorithm = f"session_based_days_{days}_session_{session}_contribution_{contribution}_threshold_{threshold}_limit_{limit}_filter_{filter_artist_credit}_skip_{skip}"

    for entries in chunked(data, RECORDINGS_PER_MESSAGE):
        items = [row.asDict() for row in entries]
        yield {
            "type": "similar_artists",
            "algorithm": algorithm,
            "data": items
        }
